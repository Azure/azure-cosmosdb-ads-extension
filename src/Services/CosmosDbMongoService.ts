import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { IConnectionOptions } from "../models";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { CdbCollectionCreateInfo } from "../sampleData/DataSamplesUtil";
import { EditorUserQuery, EditorQueryResult } from "../QueryClient/messageContract";
import { SampleData } from "./ServiceUtil";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import {
  createMongoDatabaseAndCollectionWithArm,
  createMongoDatabaseWithArm,
  getAccountNameFromOptions,
  retrieveConnectionStringFromConnectionOptions,
} from "./ArmService";
import { NativeMongoService } from "./NativeMongoService";

const localize = nls.loadMessageBundle();

export class CosmosDbMongoService extends NativeMongoService {
  /**
   * Create collection with mongodb driver
   * @param connectionOptions
   * @param databaseName
   * @returns
   */
  public createMongoDatabase(
    connectionOptions: IConnectionOptions,
    databaseName?: string
  ): Promise<{ databaseName: string }> {
    return createMongoDatabaseWithArm(
      connectionOptions.azureAccount,
      connectionOptions.azureTenantId,
      connectionOptions.azureResourceId,
      getAccountNameFromOptions(connectionOptions),
      databaseName
    );
  }

  /**
   * Create collection with mongodb driver
   * @param connectionOptions
   * @param createDatabaseOnly
   * @param databaseName
   * @param collectionName
   * @returns
   */
  public createMongoDatabaseAndCollection(
    connectionOptions: IConnectionOptions,
    databaseName?: string,
    collectionName?: string,
    cdbCreateInfo?: CdbCollectionCreateInfo
  ): Promise<{ databaseName: string; collectionName: string | undefined }> {
    return createMongoDatabaseAndCollectionWithArm(
      connectionOptions.azureAccount,
      connectionOptions.azureTenantId,
      connectionOptions.azureResourceId,
      getAccountNameFromOptions(connectionOptions),
      databaseName,
      collectionName,
      cdbCreateInfo
    );
  }

  /**
   * Create collection with mongodb driver
   * @param connectionOptions
   * @param databaseName
   * @param collectionName
   * @returns
   */
  public createMongoDbCollectionWithMongoDbClient(
    connectionOptions: IConnectionOptions,
    databaseName?: string,
    collectionName?: string
  ): Promise<{ collectionName: string; databaseName: string }> {
    return new Promise(async (resolve, reject) => {
      if (!databaseName) {
        databaseName = await vscode.window.showInputBox({
          placeHolder: localize("database", "Database"),
          prompt: localize("enterDatabaseName", "Enter database name"),
          validateInput: validateMongoDatabaseName,
          ignoreFocusOut: true,
        });
      }

      if (!collectionName) {
        collectionName = await vscode.window.showInputBox({
          placeHolder: localize("collection", "Collection"),
          prompt: localize("enterCollectionNameToCreate", "Enter collection name to create"),
          validateInput: validateMongoCollectionName,
          ignoreFocusOut: true,
        });
      }

      if (!collectionName) {
        // TODO handle error
        reject(localize("collectionCannotBeUndefined", "Collection cannot be undefined"));
        return;
      }

      if (!connectionOptions.server) {
        reject(localize("missingServerName", "Missing serverName {0}", connectionOptions.server));
        return;
      }

      let mongoClient;
      if (this._mongoClients.has(connectionOptions.server)) {
        mongoClient = this._mongoClients.get(connectionOptions.server);
      } else {
        const connectionString = await retrieveConnectionStringFromConnectionOptions(connectionOptions, true);

        if (!connectionString) {
          reject(localize("failRetrieveConnectionString", "Unable to retrieve connection string"));
          return;
        }

        mongoClient = await this.connect(connectionOptions.server, connectionString);
      }

      if (mongoClient) {
        showStatusBarItem(localize("creatingMongoCollection", "Creating Mongo collection"));
        try {
          let collection;
          collection = await mongoClient.db(databaseName).createCollection(collectionName);
          resolve({ collectionName: collection.collectionName, databaseName: databaseName! });
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

  public disconnect(server: string): Promise<void> {
    if (!this._mongoClients.has(server)) {
      return Promise.resolve();
    }

    const client = this._mongoClients.get(server);
    this._mongoClients.delete(server);
    return client!.close();
  }

  /**
   * Insert collection using mongo client
   * @param server
   * @param sampleData
   * @returns Promise with inserted count
   */
  public async insertDocuments(
    databaseDashboardInfo: IDatabaseDashboardInfo,
    sampleData: SampleData,
    collectionName: string,
    cdbCreateInfo: CdbCollectionCreateInfo
  ): Promise<{ count: number; elapsedTimeMS: number }> {
    return new Promise(async (resolve, reject) => {
      // should already be connected
      const client = this._mongoClients.get(databaseDashboardInfo.server);
      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const param: IConnectionNodeInfo = {
        ...databaseDashboardInfo,
        nodePath: createNodePath(databaseDashboardInfo.server, databaseDashboardInfo.databaseName),
      };
      const createResult = await vscode.commands.executeCommand<{ databaseName: string; collectionName: string }>(
        "cosmosdb-ads-extension.createMongoCollection",
        undefined,
        param,
        collectionName,
        cdbCreateInfo
      );

      if (!createResult.collectionName) {
        reject(localize("failCreateCollection", "Failed to create collection {0}", collectionName));
        return;
      }

      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      // Connect to collection
      const collection = await client.db(createResult.databaseName).collection(createResult.collectionName);
      if (!collection) {
        reject(localize("failFindCollection", "Failed to find collection {0}", createResult.collectionName));
        return;
      }

      showStatusBarItem(localize("insertingData", "Inserting documents ({0})...", sampleData.data.length));
      try {
        const startMS = new Date().getTime();
        const result = await collection.bulkWrite(
          sampleData.data.map((doc) => ({
            insertOne: {
              document: doc,
            },
          }))
        );
        const endMS = new Date().getTime();
        if (result.insertedCount === undefined || result.insertedCount < sampleData.data.length) {
          reject(localize("failInsertDocs", "Failed to insert all documents {0}", sampleData.data.length));
          return;
        }

        return resolve({
          count: result.insertedCount,
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
    collectionName: string,
    query: EditorUserQuery
  ): Promise<EditorQueryResult> {
    if (!this._mongoClients.has(connectionOptions.server)) {
      throw new Error(`Unknown server: ${connectionOptions.server}`); // Should we connect?
    }
    const client = this._mongoClients.get(connectionOptions.server);
    const database = client!.db(databaseName);
    const collection = database.collection(collectionName);

    const filter = JSON.parse(query.query); // e.g. { runtime: { $lt: 15 } }

    // If a limit is specified, use it. Else default to 20
    let limit = query.offsetPagingInfo?.limit ?? 20;
    if (limit < 1) {
      limit = 20;
    }
    if (limit > 50) {
      limit = 50;
    }
    // If an offset is specified, use it. Else default to 0
    // i.e no offset -> first page
    let skip = query.offsetPagingInfo?.offset ?? 0;
    if (skip < 1) {
      skip = 0;
    }

    const cursor = collection.find(filter, { limit, skip });
    // replace console.dir with your callback to access individual elements
    const documents = <any>[];
    await cursor.forEach((doc) => {
      documents.push(doc);
    });

    const total = await collection.countDocuments(filter, {});

    return {
      documents,
      offsetPagingInfo: {
        total,
        limit,
        offset: skip,
      },
    };
  }
}

export const validateMongoDatabaseName = (database: string): string | undefined | null => {
  // https://docs.mongodb.com/manual/reference/limits/#naming-restrictions
  // "#?" are restricted characters for CosmosDB - MongoDB accounts
  const min = 1;
  const max = 63;
  if (!database || database.length < min || database.length > max) {
    return localize("databaseNameMinMaxChar", "Database name must be between {0} and {1} characters", min, max);
  }
  if (/[/\\. "$#?]/.test(database)) {
    return localize("databaseNameCannotContainChar", 'Database name cannot contain these characters - `/\\. "$#?`');
  }
  return undefined;
};

export const validateMongoCollectionName = (collectionName: string): string | undefined | null => {
  // https://docs.mongodb.com/manual/reference/limits/#Restriction-on-Collection-Names
  if (!collectionName) {
    return localize("collectionNameCannotBeEmpty", "Collection name cannot be empty");
  }
  const systemPrefix = "system.";
  if (collectionName.startsWith(systemPrefix)) {
    return localize("prefixForInternalUse", "{0} prefix is reserved for internal use", systemPrefix);
  }
  if (/[$]/.test(collectionName)) {
    return localize("collectionNameCannotContainDollar", "Collection name cannot contain $");
  }
  return undefined;
};
