import {
  BulkOperationType,
  ContainerDefinition,
  CosmosClient,
  DatabaseDefinition,
  FeedResponse,
  OperationInput,
  Resource,
} from "@azure/cosmos";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { IConnectionOptions, IDatabaseInfo } from "../models";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { CdbCollectionCreateInfo } from "../sampleData/DataSamplesUtil";
import { EditorUserQuery, EditorQueryResult } from "../QueryClient/messageContract";
import { CosmosDbProxy } from "./CosmosDbProxy";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import { SampleData, isAzureAuthType } from "./ServiceUtil";
import { ArmServiceNoSql } from "./ArmServiceNoSql";
import { AbstractBackendService } from "./AbstractBackendService";

const localize = nls.loadMessageBundle();

export class CosmosDbNoSqlService extends AbstractBackendService {
  private _cosmosClients = new Map<string, CosmosClient>();
  private _cosmosDbProxies = new Map<string, CosmosDbProxy>();
  public reporter: TelemetryReporter | undefined = undefined;

  constructor() {
    super(new ArmServiceNoSql());
  }

  public async connect(server: string, connectionString: string): Promise<CosmosClient | undefined> {
    if (!this._cosmosDbProxies.has(server)) {
      this._cosmosDbProxies.set(server, new CosmosDbProxy(connectionString));
    }

    try {
      const client = new CosmosClient(connectionString);
      this._cosmosClients.set(server, client);
      return client;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  public hasConnection(server: string): boolean {
    return this._cosmosClients.has(server);
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
      ? response.resources.map((db) => ({
          name: db.id,
        }))
      : [];
  }

  public async listContainers(server: string, databaseName: string): Promise<(ContainerDefinition & Resource)[]> {
    if (!this._cosmosClients.has(server)) {
      return [];
    }
    const response = await this._cosmosClients.get(server)?.database(databaseName).containers.readAll().fetchAll();
    return response ? response.resources : [];
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
    cdbCreateInfo?: CdbCollectionCreateInfo
  ): Promise<{ databaseName: string; containerName: string | undefined }> {
    if (isAzureAuthType(connectionOptions.authenticationType)) {
      return this.armService
        .createDatabaseAndCollection(
          connectionOptions.azureAccount,
          connectionOptions.azureTenantId,
          connectionOptions.azureResourceId,
          this.armService.getAccountNameFromOptions(connectionOptions),
          databaseName,
          containerName,
          cdbCreateInfo
        )
        .then((result) => ({ ...result, containerName: result.collectionName })); // FIX THIS
    } else {
      return this.createContainerWithCosmosClient(connectionOptions, databaseName, containerName);
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
    containerName?: string
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
          const { container } = await database.containers.createIfNotExists({ id: containerName });
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
    if (!this._cosmosClients.has(server)) {
      return;
    }

    const client = this._cosmosClients.get(server);
    this._cosmosClients.delete(server);
    return client!.dispose();
  }

  /**
   * Insert container
   * @param server
   * @param sampleData
   * @returns Promise with inserted count
   */
  public async insertDocuments(
    databaseDashboardInfo: IDatabaseDashboardInfo,
    sampleData: SampleData,
    containerName: string,
    cdbCreateInfo: CdbCollectionCreateInfo
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
        "cosmosdb-ads-extension-nosql.createNoSqlContainer",
        undefined,
        param,
        containerName,
        cdbCreateInfo
      );

      if (!createResult.containerName) {
        reject(localize("failCreateCollection", "Failed to create collection {0}", containerName));
        return;
      }

      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const container = client.database(databaseDashboardInfo.databaseName!).container(containerName);
      if (!container) {
        reject(localize("failFindCollection", "Failed to find collection {0}", createResult.containerName));
        return;
      }

      // Bulk import
      const operations: OperationInput[] = sampleData.data.map((doc) => ({
        operationType: BulkOperationType.Create,
        resourceBody: doc,
      }));

      showStatusBarItem(localize("insertingData", "Inserting documents ({0})...", sampleData.data.length));

      try {
        const startMS = new Date().getTime();
        const response = await container.items.bulk(operations);
        const endMS = new Date().getTime();

        // TODO Check individual response for status code
        // Example: https://github.com/Azure-Samples/cosmos-typescript-bulk-import-throughput-optimizer/blob/master/src/importers/bulk-importer-bulk-operations.ts
        if (response === undefined || response.length < sampleData.data.length) {
          reject(localize("failInsertDocs", "Failed to insert all documents {0}", sampleData.data.length));
          return;
        }

        return resolve({
          count: response.length,
          elapsedTimeMS: endMS - startMS,
        });
      } catch (e) {
        reject(localize("failInsertDocs", "Failed to insert all documents {0}", sampleData.data.length));
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
        query.infinitePagingInfo?.continuationToken,
        query.infinitePagingInfo?.maxCount ?? 20 /* TODO MOVE TO CONSTANT */
      );
    return {
      documents: result.documents,
      infinitePagingInfo: {
        continuationToken: result.continuationToken,
        maxCount: result.maxCount,
      },
    };
  }
}
