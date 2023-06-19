import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AnyBulkWriteOperation, Collection, MongoClient, MongoClientOptions } from "mongodb";
import { isCosmosDBAccount } from "../MongoShell/mongoUtils";
import { convertToConnectionOptions, IConnectionOptions, IDatabaseInfo, IMongoShellOptions } from "../models";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { EditorUserQuery, EditorQueryResult, QueryOffsetPagingInfo } from "../QueryClient/messageContract";
import { SampleData, askUserForConnectionProfile, isAzureConnection } from "./ServiceUtil";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import { AbstractBackendService } from "./AbstractBackendService";
import { ArmServiceMongo } from "./ArmServiceMongo";
import { buildMongoConnectionString } from "../Providers/mongoConnectionString";
import { CdbCollectionCreateInfo } from "./AbstractArmService";

const localize = nls.loadMessageBundle();

export class MongoService extends AbstractBackendService {
  public _mongoClients = new Map<string, MongoClient>(); // public for testing purposes (should be protected)

  constructor() {
    super(new ArmServiceMongo());
  }

  /**
   * Connect to a server. May throw an error if the connection fails.
   * @param server - The server to connect to
   * @param connectionString - The connection string to use
   * @returns The MongoClient
   */
  public async connect(server: string, connectionString: string): Promise<MongoClient> {
    const options: MongoClientOptions = <MongoClientOptions>{};
    const mongoClient = await MongoClient.connect(connectionString, options);
    this._mongoClients.set(server, mongoClient);
    return mongoClient;
  }

  public async listDatabases(server: string): Promise<IDatabaseInfo[]> {
    if (!this._mongoClients.has(server)) {
      return [];
    }
    // https://mongodb.github.io/node-mongodb-native/3.1/api/index.html
    const result: { databases: IDatabaseInfo[] } = await this._mongoClients
      .get(server)!
      .db("test" /*testDb*/)
      .admin()
      .listDatabases();
    return result.databases.sort((a, b) => a.name.localeCompare(b.name));
  }

  public async listCollections(server: string, databaseName: string): Promise<Collection[]> {
    if (!this._mongoClients.has(server)) {
      return [];
    }
    return await this._mongoClients
      .get(server)!
      .db(databaseName)
      .collections()
      .then((collections) => collections.sort((a, b) => a.collectionName.localeCompare(b.collectionName)));
  }

  public async removeDatabase(server: string, databaseName: string): Promise<boolean> {
    if (!this._mongoClients.has(server)) {
      return false;
    }
    return await this._mongoClients.get(server)!.db(databaseName).dropDatabase();
  }

  public async removeCollection(server: string, databaseName: string, collectionName: string): Promise<boolean> {
    if (!this._mongoClients.has(server)) {
      return false;
    }
    return await this._mongoClients.get(server)!.db(databaseName).dropCollection(collectionName);
  }

  public getMongoShellOptions(connectionOptions?: IConnectionOptions): Promise<IMongoShellOptions | undefined> {
    return new Promise(async (resolve, reject) => {
      if (!connectionOptions) {
        const connectionProfile = await askUserForConnectionProfile();
        if (!connectionProfile) {
          reject("Failed to retrieve connection profile");
          return;
        }
        connectionOptions = convertToConnectionOptions(connectionProfile);
      }

      const connectionString = await this.retrieveConnectionStringFromConnectionOptions(connectionOptions, true);

      if (!connectionString) {
        reject(localize("failRetrieveConnectionString", "Unable to retrieve connection string"));
        return;
      }

      // TODO Use different parsing method if vanilla mongo
      const options: IMongoShellOptions = {
        isCosmosDB: isCosmosDBAccount(connectionString),
        connectionString,
        connectionInfo: undefined,
      };

      resolve(options);
    });
  }

  /**
   * Create database
   * @param connectionOptions
   * @param databaseName
   * @returns
   */
  public createMongoDatabase(
    connectionOptions: IConnectionOptions,
    databaseName?: string
  ): Promise<{ databaseName: string }> {
    return isAzureConnection(connectionOptions) && !connectionOptions.isServer
      ? this.createMongoDatabaseWithArm(connectionOptions, databaseName)
      : // In MongoDB, a database cannot be empty.
        this.createMongoDbCollectionWithMongoDbClient(connectionOptions, databaseName, undefined);
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
    return isAzureConnection(connectionOptions) && !connectionOptions.isServer
      ? this.createMongoDatabaseAndCollectionWithArm(connectionOptions, databaseName, collectionName)
      : this.createMongoDbCollectionWithMongoDbClient(connectionOptions, databaseName, collectionName);
  }

  /**
   * Create Database with arm
   * @param connectionOptions
   * @param databaseName
   * @returns
   */
  private createMongoDatabaseWithArm(
    connectionOptions: IConnectionOptions,
    databaseName?: string
  ): Promise<{ databaseName: string }> {
    return this.armService.createDatabase(
      connectionOptions.azureAccount,
      connectionOptions.azureTenantId,
      connectionOptions.azureResourceId,
      this.armService.getAccountNameFromOptions(connectionOptions),
      databaseName
    );
  }

  /**
   * Create collection with arm
   * @param connectionOptions
   * @param createDatabaseOnly
   * @param databaseName
   * @param collectionName
   * @returns
   */
  private createMongoDatabaseAndCollectionWithArm(
    connectionOptions: IConnectionOptions,
    databaseName?: string,
    collectionName?: string,
    cdbCreateInfo?: CdbCollectionCreateInfo
  ): Promise<{ databaseName: string; collectionName: string | undefined }> {
    return this.armService
      .createDatabaseAndContainer(
        connectionOptions.azureAccount,
        connectionOptions.azureTenantId,
        connectionOptions.azureResourceId,
        this.armService.getAccountNameFromOptions(connectionOptions),
        databaseName,
        collectionName,
        cdbCreateInfo
      )
      .then((result) => ({ databaseName: result.databaseName, collectionName: result.containerName }));
  }

  /**
   * Create collection with mongodb driver
   * @param connectionOptions
   * @param databaseName
   * @param collectionName
   * @returns
   */
  private createMongoDbCollectionWithMongoDbClient(
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
        const connectionString = await this.retrieveConnectionStringFromConnectionOptions(connectionOptions, true);

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

  protected disconnectAll(): void {
    this._mongoClients.forEach((_, server) => this.disconnect(server));
  }

  /**
   * Insert collection using mongo client
   * @param server
   * @param sampleData
   * @returns Promise with inserted count
   */
  public async createCollectionWithSampleData(
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

      await this.insertDocuments(
        databaseDashboardInfo.server,
        createResult.databaseName,
        createResult.collectionName,
        sampleData.data
      );
    });
  }

  public async insertDocuments(serverName: string, databaseName: string, collectionName: string, data: unknown[]) {
    return new Promise(async (resolve, reject) => {
      const client = this._mongoClients.get(serverName);
      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const collection = await client.db(databaseName).collection(collectionName);
      if (!collection) {
        reject(localize("failFindCollection", "Failed to find collection {0}", collectionName));
        return;
      }

      showStatusBarItem(localize("insertingData", "Inserting documents ({0})...", data.length));
      try {
        const startMS = new Date().getTime();
        const result = await collection.bulkWrite(
          data.map((doc) => ({
            insertOne: {
              document: doc as AnyBulkWriteOperation<Document>[],
            },
          }))
        );
        const endMS = new Date().getTime();
        if (result.insertedCount === undefined || result.insertedCount < data.length) {
          reject(localize("failInsertDocs", "Failed to insert all documents {0}", data.length));
          hideStatusBarItem();
          return;
        }

        return resolve({
          count: result.insertedCount,
          elapsedTimeMS: endMS - startMS,
        });
      } catch (e) {
        reject(localize("failInsertDocs", "Failed to insert all documents {0}", data.length));
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
    let limit = (query.pagingInfo as QueryOffsetPagingInfo)?.limit ?? 20;
    if (limit < 1) {
      limit = 20;
    }
    if (limit > 50) {
      limit = 50;
    }
    // If an offset is specified, use it. Else default to 0
    // i.e no offset -> first page
    let skip = (query.pagingInfo as QueryOffsetPagingInfo)?.offset ?? 0;
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
      pagingInfo: {
        kind: "offset",
        total,
        limit,
        offset: skip,
      },
    };
  }

  public getDocuments(serverName: string, databaseName: string, containerName: string): Promise<unknown[]> {
    return new Promise(async (resolve, reject) => {
      const client = this._mongoClients.get(serverName);
      if (!client) {
        reject(localize("notConnected", "Not connected"));
        return;
      }

      const collection = await client.db(databaseName).collection(containerName);
      if (!collection) {
        reject(localize("failFindCollection", "Failed to find collection {0}", containerName));
        return;
      }

      const documents = await collection.find({}).toArray();
      resolve(documents);
    });
  }

  protected buildConnectionString(connectionOptions: IConnectionOptions): string | undefined {
    return buildMongoConnectionString(connectionOptions);
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
