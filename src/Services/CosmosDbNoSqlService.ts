import {
  BulkOperationType,
  ContainerDefinition,
  CosmosClient,
  DatabaseDefinition,
  FeedResponse,
  JSONObject,
  OperationInput,
  Resource,
  RequestOptions,
} from "@azure/cosmos";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { IConnectionOptions, ICosmosDbContainerInfo, IDatabaseInfo } from "../models";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { EditorUserQuery, EditorQueryResult, QueryInfinitePagingInfo } from "../QueryClient/messageContract";
import { CosmosDbProxy } from "./CosmosDbProxy";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import { SampleData, isAzureAuthType } from "./ServiceUtil";
import { ArmServiceNoSql } from "./ArmServiceNoSql";
import { AbstractBackendService } from "./AbstractBackendService";
import { buildCosmosDbNoSqlConnectionString } from "../Providers/cosmosDbNoSqlConnectionString";
import { NOSQL_QUERY_RESULT_MAX_COUNT } from "../constant";
import { CdbContainerCreateInfo } from "./AbstractArmService";

const localize = nls.loadMessageBundle();

// Maximum number of operations to send in a single bulk operation
// Although the Cosmos DB SDK supports up to 100 operations, the low container default RU/s provisioning limits insertion without throttling
const MAX_BULK_OPERATION_COUNT = 100;

const MIN_RETRY_DELAY_MS = 20; // Minimum delay before retrying a throttled operation

export class CosmosDbNoSqlService extends AbstractBackendService {
  public _cosmosClients = new Map<string, CosmosClient>(); // public for testing purposes (should be private)
  private _cosmosDbProxies = new Map<string, CosmosDbProxy>();
  public reporter: TelemetryReporter | undefined = undefined;

  constructor(armService: ArmServiceNoSql) {
    super(armService);
  }

  /**
   * Connect to a server. May throw an error if the connection fails.
   * @param server - The server to connect to
   * @param connectionString - The connection string to use
   * @returns The CosmosClient
   */
  public async connect(server: string, connectionString: string): Promise<CosmosClient> {
    if (!this._cosmosDbProxies.has(server)) {
      this._cosmosDbProxies.set(server, new CosmosDbProxy(server, connectionString));
    }

    const client = new CosmosClient(connectionString);
    this._cosmosClients.set(server, client);
    return client;
  }

  public async listDatabases(server: string): Promise<IDatabaseInfo[]> {
    if (!this._cosmosClients.has(server)) {
      return [];
    }

    const response: FeedResponse<DatabaseDefinition & Resource> | undefined = await this._cosmosClients
      .get(server)
      ?.databases.readAll()
      .fetchAll();

    // TODO Add more info here
    return response
      ? response.resources
          .map((db) => ({
            name: db.id,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  }

  public async listContainers(server: string, databaseName: string): Promise<(ContainerDefinition & Resource)[]> {
    if (!this._cosmosClients.has(server)) {
      return [];
    }
    const response = await this._cosmosClients.get(server)?.database(databaseName).containers.readAll().fetchAll();
    return response ? response.resources.sort((a, b) => a.id.localeCompare(b.id)) : [];
  }

  public async removeDatabase(server: string, databaseName: string): Promise<boolean> {
    if (!this._cosmosClients.has(server)) {
      return false;
    }
    const response = await this._cosmosClients.get(server)?.database(databaseName).delete();
    return response?.statusCode === 200 || response?.statusCode === 204;
  }

  public async removeContainer(server: string, databaseName: string, containerName: string): Promise<boolean> {
    if (!this._cosmosClients.has(server)) {
      return false;
    }
    const response = await this._cosmosClients.get(server)?.database(databaseName).container(containerName).delete();
    return response?.statusCode === 200 || response?.statusCode === 204;
  }

  /**
   * Create database
   * @param connectionOptions
   * @param databaseName
   * @returns
   */
  public createNoSqlDatabase(
    connectionOptions: IConnectionOptions,
    databaseName?: string
  ): Promise<{ databaseName: string }> {
    if (isAzureAuthType(connectionOptions.authenticationType)) {
      return this.armService.createDatabase(
        connectionOptions.azureAccount,
        connectionOptions.azureTenantId,
        connectionOptions.azureResourceId,
        this.armService.getAccountNameFromOptions(connectionOptions),
        databaseName
      );
    } else {
      return this.createDatabaseWithCosmosClient(connectionOptions, databaseName);
    }
  }

  /**
   * Create container
   * @param connectionOptions
   * @param createDatabaseOnly
   * @param databaseName
   * @param containerName
   * @returns
   */
  public createCosmosDatabaseAndContainer(
    connectionOptions: IConnectionOptions,
    databaseName?: string,
    containerName?: string,
    cdbCreateInfo?: CdbContainerCreateInfo
  ): Promise<{ databaseName: string; containerName: string | undefined }> {
    // TODO We can do everthing with the client
    if (isAzureAuthType(connectionOptions.authenticationType)) {
      return this.armService
        .createDatabaseAndContainer(
          connectionOptions.azureAccount,
          connectionOptions.azureTenantId,
          connectionOptions.azureResourceId,
          this.armService.getAccountNameFromOptions(connectionOptions),
          databaseName,
          containerName,
          cdbCreateInfo
        )
        .then((result) => ({ ...result, containerName: result.containerName }));
    } else {
      return this.createContainerWithCosmosClient(connectionOptions, databaseName, containerName, cdbCreateInfo);
    }
  }

  /**
   * Create database with cosmosdb sdk
   * @param connectionOptions
   * @param databaseName
   * @param containerName
   * @returns
   */
  public async createDatabaseWithCosmosClient(
    connectionOptions: IConnectionOptions,
    databaseName?: string
  ): Promise<{ databaseName: string }> {
    return new Promise(async (resolve, reject) => {
      if (!databaseName) {
        databaseName = await vscode.window.showInputBox({
          placeHolder: localize("database", "Database"),
          prompt: localize("enterDatabaseName", "Enter database name"),
          // validateInput: validateMongoDatabaseName,
          ignoreFocusOut: true,
        });
      }

      if (!connectionOptions.server) {
        reject(localize("missingServerName", "Missing serverName {0}", connectionOptions.server));
        return;
      }

      let cosmosClient;
      if (this._cosmosClients.has(connectionOptions.server)) {
        cosmosClient = this._cosmosClients.get(connectionOptions.server);
      } else {
        const connectionString = await this.retrieveConnectionStringFromConnectionOptions(connectionOptions, true);

        if (!connectionString) {
          reject(localize("failRetrieveConnectionString", "Unable to retrieve connection string"));
          return;
        }

        cosmosClient = await this.connect(connectionOptions.server, connectionString);
      }

      if (cosmosClient) {
        showStatusBarItem(localize("creatingCosmosDbDatabase", "Creating Cosmos DB database"));
        try {
          const response = await cosmosClient.databases.createIfNotExists({ id: databaseName });
          resolve({ databaseName: response.database.id });
        } catch (e) {
          reject(e);
          return;
        } finally {
          hideStatusBarItem();
          return;
        }
      } else {
        reject(localize("failConnectTo", "Could not connect to {0}", connectionOptions.server));
        return;
      }
    });
  }

  /**
   * Create container with cosmosdb sdk
   * @param connectionOptions
   * @param databaseName
   * @param containerName
   * @returns
   */
  public async createContainerWithCosmosClient(
    connectionOptions: IConnectionOptions,
    databaseName?: string,
    containerName?: string,
    cdbCreateInfo?: CdbContainerCreateInfo
  ): Promise<{ containerName: string; databaseName: string }> {
    return new Promise(async (resolve, reject) => {
      if (!databaseName) {
        databaseName = await vscode.window.showInputBox({
          placeHolder: localize("database", "Database"),
          prompt: localize("enterDatabaseName", "Enter database name"),
          // validateInput: validateMongoDatabaseName,
          ignoreFocusOut: true,
        });
      }

      if (!containerName) {
        containerName = await vscode.window.showInputBox({
          placeHolder: localize("container", "Container"),
          prompt: localize("enterContainerNameToCreate", "Enter container name to create"),
          // validateInput: validateMongoCollectionName,
          ignoreFocusOut: true,
        });
      }

      if (!containerName) {
        // TODO handle error
        reject(localize("containerCannotBeUndefined", "Container cannot be undefined"));
        return;
      }

      if (!connectionOptions.server) {
        reject(localize("missingServerName", "Missing serverName {0}", connectionOptions.server));
        return;
      }

      let cosmosClient;
      if (this._cosmosClients.has(connectionOptions.server)) {
        cosmosClient = this._cosmosClients.get(connectionOptions.server);
      } else {
        const connectionString = await this.retrieveConnectionStringFromConnectionOptions(connectionOptions, true);

        if (!connectionString) {
          reject(localize("failRetrieveConnectionString", "Unable to retrieve connection string"));
          return;
        }

        cosmosClient = await this.connect(connectionOptions.server, connectionString);
      }

      if (cosmosClient) {
        showStatusBarItem(localize("creatingCosmosContainer", "Creating Cosmos container"));

        try {
          const { database } = await cosmosClient.databases.createIfNotExists({ id: databaseName });
          const { container } = await database.containers.createIfNotExists({
            id: containerName,
            partitionKey: cdbCreateInfo?.partitionKey ? { paths: [cdbCreateInfo.partitionKey] } : undefined,
            throughput: cdbCreateInfo?.requiredThroughputRUPS,
          });
          resolve({ containerName: container.id, databaseName: database.id });
        } catch (e) {
          reject(e);
          return;
        } finally {
          hideStatusBarItem();
          return;
        }
      } else {
        reject(localize("failConnectTo", "Could not connect to {0}", connectionOptions.server));
        return;
      }
    });
  }

  public disconnect(server: string): void {
    const client = this._cosmosClients.get(server);
    if (client) {
      this._cosmosClients.delete(server);
      client.dispose();
    }

    const proxy = this._cosmosDbProxies.get(server);
    if (proxy) {
      this._cosmosDbProxies.delete(server);
      proxy.dispose();
    }
  }

  protected disconnectAll(): void {
    this._cosmosClients.forEach((_, server) => this.disconnect(server));
    this._cosmosDbProxies.forEach((proxy) => proxy.dispose());
    this._cosmosDbProxies.clear();
  }

  /**
   * Insert collection using mongo client
   * @param server
   * @param sampleData
   * @returns Promise with inserted count
   */
  public async createContainerWithSampleData(
    databaseDashboardInfo: IDatabaseDashboardInfo,
    sampleData: SampleData,
    containerName: string,
    cdbCreateInfo: CdbContainerCreateInfo,
    onProgress?: (percentIncrement: number) => void
  ): Promise<{ count: number; elapsedTimeMS: number }> {
    return new Promise(async (resolve, reject) => {
      // should already be connected
      const client = this._cosmosClients.get(databaseDashboardInfo.server);
      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const param: IConnectionNodeInfo = {
        ...databaseDashboardInfo,
        nodePath: createNodePath(databaseDashboardInfo.server, databaseDashboardInfo.databaseName),
      };
      const createResult = await vscode.commands.executeCommand<{ databaseName: string; containerName: string }>(
        "cosmosdb-ads-extension.createNoSqlContainer",
        undefined,
        param,
        containerName,
        cdbCreateInfo
      );

      if (!createResult.containerName) {
        reject(localize("failCreateContainer", "Failed to create container {0}", containerName));
        return;
      }

      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const container = await client.database(createResult.databaseName).container(createResult.containerName);
      if (!container) {
        reject(localize("failFindContainer", "Failed to find container {0}", createResult.containerName));
        return;
      }

      const result = await this.insertDocuments(
        databaseDashboardInfo.server,
        createResult.databaseName,
        createResult.containerName,
        sampleData.data,
        onProgress
      );
      resolve(result);
    });
  }

  public async insertDocuments(
    serverName: string,
    databaseName: string,
    containerName: string,
    data: unknown[],
    onProgress?: (percentIncrement: number) => void
  ): Promise<{ count: number; elapsedTimeMS: number }> {
    return new Promise(async (resolve, reject) => {
      const client = this._cosmosClients.get(serverName);
      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const container = await client.database(databaseName).container(containerName);
      if (!container) {
        reject(localize("failFindContainer", "Failed to find container {0}", containerName));
        return;
      }

      const count = data.length;

      showStatusBarItem(localize("insertingData", "Inserting documents ({0})...", count));
      try {
        const startMS = new Date().getTime();
        let delayMs = 0;
        while (data.length > 0) {
          console.log(`${data.length} documents left to insert...`);

          // This logic takes into account the retry delay provided by cosmosdb in case of throttling
          await new Promise<void>((resolve1, reject1) => {
            setTimeout(async () => {
              const candidatesToInsert = data.splice(0, MAX_BULK_OPERATION_COUNT);

              const operationResponses = await container.items.bulk(
                candidatesToInsert.map(
                  (doc): OperationInput => ({
                    operationType: BulkOperationType.Create,
                    resourceBody: doc as JSONObject,
                  })
                )
              );

              let insertedCount = 0;
              for (let i = 0; i < operationResponses.length; i++) {
                const response = operationResponses[i];
                if (response.statusCode === 201) {
                  insertedCount++;
                } else {
                  if (response.statusCode === 429) {
                    // Throttling: retry by pushing document back to the beginning of array
                    const docToRetry = candidatesToInsert[i];
                    const retryAfterInMilliseconds =
                      response.resourceBody?.retryAfterInMilliseconds &&
                      typeof response.resourceBody?.retryAfterInMilliseconds === "number"
                        ? response.resourceBody?.retryAfterInMilliseconds
                        : MIN_RETRY_DELAY_MS;

                    data.unshift(docToRetry);
                    delayMs = retryAfterInMilliseconds;
                  } else {
                    reject1(localize("unhandledStatusCode", "Unhandled status code {0}", response.statusCode));
                    hideStatusBarItem();
                    return;
                  }
                }
              }

              if (onProgress) {
                onProgress((insertedCount * 100) / count);
              }

              resolve1();
            }, delayMs);
          });
        }

        const endMS = new Date().getTime();

        return resolve({
          count,
          elapsedTimeMS: endMS - startMS,
        });
      } catch (e: any) {
        reject(localize("failInsertDocs", "Failed to insert documents. Error: {0}", e));
        return;
      } finally {
        hideStatusBarItem();
      }
    });
  }

  public async submitQuery(
    connectionOptions: IConnectionOptions,
    databaseName: string,
    containerName: string,
    query: EditorUserQuery
  ): Promise<EditorQueryResult> {
    if (!this._cosmosDbProxies.has(connectionOptions.server)) {
      throw new Error(`Unknown server: ${connectionOptions.server}`); // Should we connect?
    }

    const result = await this._cosmosDbProxies
      .get(connectionOptions.server)!
      .submitQuery(
        databaseName,
        containerName,
        query.query,
        (query.pagingInfo as QueryInfinitePagingInfo)?.continuationToken,
        (query.pagingInfo as QueryInfinitePagingInfo)?.maxCount ?? NOSQL_QUERY_RESULT_MAX_COUNT
      );
    return {
      documents: result.documents,
      requestCharge: result.requestCharge,
      pagingInfo: {
        kind: "infinite",
        continuationToken: result.continuationToken,
        maxCount: result.maxCount,
      },
    };
  }

  public getDocuments(serverName: string, databaseName: string, containerName: string): Promise<unknown[]> {
    return new Promise(async (resolve, reject) => {
      if (!this._cosmosClients.has(serverName)) {
        return reject(new Error(`Unknown server: ${serverName}`)); // Should we connect?
      }

      resolve(
        (
          await this._cosmosClients
            .get(serverName)!
            .database(databaseName)
            .container(containerName)
            .items.readAll()
            .fetchAll()
        ).resources
      );
    });
  }

  public buildConnectionString(connectionOptions: IConnectionOptions): string | undefined {
    if (!connectionOptions.server) {
      return undefined;
    }

    return buildCosmosDbNoSqlConnectionString(connectionOptions);
  }

  // Extra methods specific to Cosmos DB NoSQL

  public async retrieveContainersInfo(
    databaseDashboardInfo: IDatabaseDashboardInfo,
    databaseName: string
  ): Promise<ICosmosDbContainerInfo[]> {
    return new Promise(async (resolve, reject) => {
      const client = this._cosmosClients.get(databaseDashboardInfo.server);
      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const database = client.database(databaseName);
      if (!database) {
        reject(localize("failFindDatabase", "Failed to find database {0}", databaseName));
        return;
      }

      try {
        const containers = await database.containers.readAll().fetchAll();
        const result: ICosmosDbContainerInfo[] = await Promise.all(
          containers.resources.map(async (container) => {
            const offer = await database.container(container.id).readOffer();
            offer.resource?.content?.offerThroughput;
            return {
              name: container.id,
              partitionKey: container.partitionKey?.paths.join(",") ?? "",
              currentThroughput: offer?.resource?.content?.offerThroughput ?? 0,
            };
          })
        );
        return resolve(result);
      } catch (e) {
        reject(localize("failRetrieveContainers", "Failed to retrieve containers for database {0}", databaseName));
        return;
      }
    });
  }
}
