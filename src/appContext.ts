import { Collection, MongoClient, MongoClientOptions } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as azdata from "azdata";
import { ProviderId } from "./Providers/connectionProvider";
import { CosmosDBManagementClient } from "@azure/arm-cosmosdb";
import { MonitorManagementClient } from "@azure/arm-monitor";
import { TokenCredentials } from "@azure/ms-rest-js";
import { ThroughputSettingsGetPropertiesResource } from "@azure/arm-cosmosdb/esm/models";
import { getServerState } from "./Dashboards/ServerUXStates";
import { getUsageSizeInKB } from "./Dashboards/getCollectionDataUsageSize";
import { isCosmosDBAccount } from "./MongoShell/mongoUtils";

// import { CosmosClient, DatabaseResponse } from '@azure/cosmos';

export interface IDatabaseInfo {
  name?: string;
  sizeOnDisk: number;
  empty?: boolean;
}

type ConnectionPick = azdata.connection.ConnectionProfile & vscode.QuickPickItem;

export interface ICosmosDbDatabaseAccountInfo {
  serverStatus: string;
  backupPolicy: string;
  consistencyPolicy: string;
  readLocations: string[];
  location: string;
}

export interface ICosmosDbDatabaseInfo {
  name: string;
  nbCollections: number;
  throughputSetting: string;
  usageSizeKB: number | undefined;
}

export interface ICosmosDbCollectionInfo {
  name: string;
  documentCount: number | undefined;
  throughputSetting: string;
  usageSizeKB: number | undefined;
}

export interface IMongoShellOptions {
  isCosmosDB: boolean;
  connectionString: string | undefined;
  connectionInfo:
    | {
        hostname: string;
        port: string | undefined;
        username: string | undefined;
        password: string | undefined;
      }
    | undefined;
}

let statusBarItem: vscode.StatusBarItem | undefined = undefined;
const localize = nls.loadMessageBundle();

/**
 * Global context for app
 */
export class AppContext {
  public static readonly CONNECTION_INFO_KEY_PROP = "server"; // Unique key to store connection info against
  private _mongoClients = new Map<string, MongoClient>();

  public async connect(server: string, connectionString: string): Promise<MongoClient | undefined> {
    const options: MongoClientOptions = <MongoClientOptions>{};
    try {
      const mongoClient = await MongoClient.connect(connectionString, options);
      this._mongoClients.set(server, mongoClient);
      return mongoClient;
    } catch (error) {
      console.error(error);
      return undefined;
    }
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
    return result.databases;
  }

  public async listCollections(server: string, databaseName: string): Promise<Collection[]> {
    if (!this._mongoClients.has(server)) {
      return [];
    }
    return await this._mongoClients.get(server)!.db(databaseName).collections();
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

  private async _askUserForConnectionProfile(): Promise<ConnectionPick | undefined> {
    const connections = await azdata.connection.getConnections();
    const picks: ConnectionPick[] = connections
      .filter((c) => c.providerId === ProviderId)
      .map((c) => ({
        ...c,
        label: c.connectionName,
      }));

    return vscode.window.showQuickPick<ConnectionPick>(picks, {
      placeHolder: localize("selectMongoAccount", "Select mongo account"),
    });
  }

  public getMongoShellOptions(connectionInfo?: azdata.ConnectionInfo): Promise<IMongoShellOptions | undefined> {
    return new Promise(async (resolve, reject) => {
      if (!connectionInfo) {
        const connectionProfile = await this._askUserForConnectionProfile();
        if (!connectionProfile) {
          // TODO Show error here
          resolve(undefined);
          return;
        }

        connectionInfo = connectionProfile;
      }

      const serverName = connectionInfo.options["server"];
      if (!serverName) {
        reject(localize("missingServerName", "Missing serverName {0}", serverName));
        return;
      }

      // TODO reduce code duplication with ConnectionProvider.connect
      const connection = await (await azdata.connection.getConnections()).filter((c) => c.serverName === serverName);
      if (connection.length < 1) {
        reject(localize("failRetrieveCredentials", "Unable to retrieve credentials for {0}", serverName));
        return;
      }
      const credentials = await azdata.connection.getCredentials(connection[0].connectionId);
      let connectionString = credentials["password"];

      if (connectionInfo.options["authenticationType"] === "AzureMFA") {
        try {
          connectionString = await retrieveConnectionStringFromArm(connectionInfo);
        } catch (e) {
          vscode.window.showErrorMessage((e as { message: string }).message);
          return false;
        }
      }

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

  public createMongoCollection(
    connectionInfo?: azdata.ConnectionInfo,
    databaseName?: string,
    collectionName?: string
  ): Promise<{ collection: Collection; databaseName: string }> {
    return new Promise(async (resolve, reject) => {
      if (!connectionInfo) {
        const connectionProfile = await this._askUserForConnectionProfile();
        if (!connectionProfile) {
          // TODO Show error here
          reject(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return;
        }

        connectionInfo = connectionProfile;
      }

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
          prompt: localize("enterCollectionName", "Enter collection name"),
          validateInput: validateMongoCollectionName,
          ignoreFocusOut: true,
        });
      }

      if (!collectionName) {
        // TODO handle error
        reject(localize("collectionCannotBeUndefined", "Collection cannot be undefined"));
        return;
      }

      const serverName = connectionInfo.options["server"];
      if (!serverName) {
        reject(localize("missingServerName", "Missing serverName {0}", serverName));
      }

      // TODO reduce code duplication with ConnectionProvider.connect
      const connection = await (await azdata.connection.getConnections()).filter((c) => c.serverName === serverName);
      if (connection.length < 1) {
        reject(localize("failRetrieveCredentials", "Unable to retrieve credentials for {0}", serverName));
        return;
      }
      const credentials = await azdata.connection.getCredentials(connection[0].connectionId);
      let connectionString = credentials["password"];

      if (connectionInfo.options["authenticationType"] === "AzureMFA") {
        try {
          connectionString = await retrieveConnectionStringFromArm(connectionInfo);
        } catch (e) {
          vscode.window.showErrorMessage((e as { message: string }).message);
          return false;
        }
      }

      if (!connectionString) {
        reject(localize("failRetrieveConnectionString", "Unable to retrieve connection string"));
        return;
      }

      const client = await this.connect(serverName, connectionString);

      if (client) {
        const collection = await client.db(databaseName).createCollection(collectionName);
        resolve({ collection, databaseName: databaseName! });
      } else {
        reject(localize("failConnectTo", "Could not connect to {0}", serverName));
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
   *
   * @param server
   * @param sampleData
   * @returns Promise with inserted count
   */
  public async insertDocuments(server: string, sampleData: SampleData): Promise<number> {
    return new Promise(async (resolve, reject) => {
      if (sampleData.data.length < 1) {
        reject(localize("noSampleDataProvided", "No sample data provided"));
        return;
      }

      // should already be connected
      const client = this._mongoClients.get(server);
      if (!client) {
        return Promise.reject(localize("notConnected", "Not connected"));
      }

      const response = await vscode.window.showInformationMessage(
        localize(
          "ingestSampleMongoDataConfirm",
          "This will create a database '{0}' and a collection '{1}'. Are you sure?",
          sampleData.databaseId,
          sampleData.collectionId
        ),
        ...[localize("yes", "Yes"), localize("no", "No")]
      );
      if (response !== "Yes") {
        return;
      }

      let collection = undefined;
      if (sampleData.createNewDatabase) {
        showStatusBarItem(localize("creatingCollection", "Creating collection {0}...", sampleData.collectionId));
        collection = await client.db(sampleData.databaseId).createCollection(sampleData.collectionId);
        hideStatusBarItem();
        if (!collection) {
          reject(localize("failCreateCollection", "Failed to create collection"));
          return;
        }
      } else {
        collection = await client.db(sampleData.databaseId).collection(sampleData.collectionId);
        if (!collection) {
          reject(localize("failGetCollection", "Failed to get collection"));
          return;
        }
      }

      showStatusBarItem(localize("insertingData", "Inserting documents ({0})...", sampleData.data.length));
      const result = await collection.insert(sampleData.data);
      hideStatusBarItem();
      if (result.insertedCount < sampleData.data.length) {
        reject(localize("failInsertDocs", "Failed to insert all documents {0}", sampleData.data.length));
        return;
      }

      return resolve(result.insertedCount);
    });
  }
}

export const createStatusBarItem = (): void => {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
};

export const showStatusBarItem = (text: string): void => {
  if (statusBarItem) {
    statusBarItem.text = text;
    statusBarItem.show();
  }
};

export const hideStatusBarItem = (): void => {
  if (statusBarItem) {
    statusBarItem.hide();
  }
};

export function validateMongoCollectionName(collectionName: string): string | undefined | null {
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
}

function validateMongoDatabaseName(database: string): string | undefined | null {
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
}

const retrieveAzureAccount = async (accountId: string): Promise<azdata.Account> => {
  const manyAccounts = await azdata.accounts.getAllAccounts();
  showStatusBarItem(localize("retrievingAzureAccount", "Retrieving Azure Account..."));
  const accounts = (await azdata.accounts.getAllAccounts()).filter((a) => a.key.accountId === accountId);
  hideStatusBarItem();
  if (accounts.length < 1) {
    throw new Error(localize("noAzureAccountFound", "No azure account found"));
  }

  return accounts[0];
};

const retrieveAzureToken = async (
  connectionInfo: azdata.ConnectionInfo
): Promise<{ token: string; tokenType?: string | undefined }> => {
  const tenantId = connectionInfo.options["azureTenantId"];
  const accountId = connectionInfo.options["azureAccount"];
  const azureAccount = await retrieveAzureAccount(accountId);

  showStatusBarItem(localize("retrievingAzureToken", "Retrieving Azure Token..."));
  const azureToken = await azdata.accounts.getAccountSecurityToken(
    azureAccount,
    tenantId,
    azdata.AzureResource.ResourceManagement
  );
  hideStatusBarItem();

  if (!azureToken) {
    throw new Error(localize("failRetrieveArmToken", "Unable to retrieve ARM token"));
  }

  return azureToken;
};

const parsedAzureResourceId = (azureResourceId: string): { subscriptionId: string; resourceGroup: string } => {
  // TODO Add error handling
  const parsedAzureResourceId = azureResourceId.split("/");
  return {
    subscriptionId: parsedAzureResourceId[2],
    resourceGroup: parsedAzureResourceId[4],
  };
};

const createArmClient = async (connectionInfo: azdata.ConnectionInfo): Promise<CosmosDBManagementClient> => {
  const accountId = connectionInfo.options["azureAccount"];
  const azureAccount = await retrieveAzureAccount(accountId);
  const armEndpoint = azureAccount.properties?.providerSettings?.settings?.armResource?.endpoint;

  if (!armEndpoint) {
    throw new Error(localize("failRetrieveArmEndpoint", "Unable to retrieve ARM endpoint"));
  }

  const { subscriptionId } = parsedAzureResourceId(connectionInfo.options["azureResourceId"]);
  const azureToken = await retrieveAzureToken(connectionInfo);
  const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

  return new CosmosDBManagementClient(credentials, subscriptionId, { baseUri: armEndpoint });
};

const createArmMonitorClient = async (connectionInfo: azdata.ConnectionInfo): Promise<MonitorManagementClient> => {
  const accountId = connectionInfo.options["azureAccount"];
  const azureAccount = await retrieveAzureAccount(accountId);
  const armEndpoint = azureAccount.properties?.providerSettings?.settings?.armResource?.endpoint;

  if (!armEndpoint) {
    throw new Error(localize("failRetrieveArmEndpoint", "Unable to retrieve ARM endpoint"));
  }

  const { subscriptionId } = parsedAzureResourceId(connectionInfo.options["azureResourceId"]);
  const azureToken = await retrieveAzureToken(connectionInfo);
  const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

  return new MonitorManagementClient(credentials, subscriptionId, { baseUri: armEndpoint });
};

/**
 * use cosmosdb-arm to retrive connection string
 */
export const retrieveConnectionStringFromArm = async (connectionInfo: azdata.ConnectionInfo): Promise<string> => {
  const client = await createArmClient(connectionInfo);
  const cosmosDbAccountName = connectionInfo.options["server"];
  const { resourceGroup } = parsedAzureResourceId(connectionInfo.options["azureResourceId"]);
  showStatusBarItem(localize("retrievingConnectionString", "Retrieving connection string..."));
  const connectionStringsResponse = await client.databaseAccounts.listConnectionStrings(
    resourceGroup,
    cosmosDbAccountName
  );
  hideStatusBarItem();
  const connectionString = connectionStringsResponse.connectionStrings?.[0]?.connectionString;
  if (!connectionString) {
    throw new Error(localize("missingConnectionString", "Missing connection string"));
  }
  return connectionString;
};

export const retrieveDatabaseAccountInfoFromArm = async (
  connectionInfo: azdata.ConnectionInfo
): Promise<ICosmosDbDatabaseAccountInfo> => {
  const client = await createArmClient(connectionInfo);
  const accountName = getAccountName(connectionInfo);
  const { resourceGroup } = parsedAzureResourceId(connectionInfo.options["azureResourceId"]);
  showStatusBarItem(localize("retrievingDatabaseAccounts", "Retrieving database accounts..."));
  const databaseAccount = await client.databaseAccounts.get(resourceGroup, accountName);
  hideStatusBarItem();
  return {
    serverStatus: getServerState(databaseAccount.provisioningState),
    backupPolicy: databaseAccount.backupPolicy?.type ?? localize("none", "None"),
    consistencyPolicy: databaseAccount.consistencyPolicy?.defaultConsistencyLevel ?? localize("none", "None"),
    location: databaseAccount.location ?? localize("unknown", "Unknown"),
    readLocations: databaseAccount.readLocations ? databaseAccount.readLocations.map((l) => l.locationName ?? "") : [],
  };
};

const throughputSettingToString = (throughputSetting: ThroughputSettingsGetPropertiesResource): string => {
  if (throughputSetting.autoscaleSettings) {
    return `Max: ${throughputSetting.autoscaleSettings.maxThroughput} RU/s (autoscale)`;
  } else if (throughputSetting.throughput) {
    return `${throughputSetting.throughput} RU/s`;
  } else {
    return "";
  }
};

const retrieveMongoDbDatabaseInfoFromArm = async (
  client: CosmosDBManagementClient,
  resourceGroupName: string,
  accountName: string,
  databaseName: string,
  monitorARmClient: MonitorManagementClient,
  resourceUri: string
): Promise<ICosmosDbDatabaseInfo> => {
  showStatusBarItem(localize("retrievingMongoDbCollection", "Retrieving mongodb collections..."));
  const collections = await client.mongoDBResources.listMongoDBCollections(
    resourceGroupName,
    accountName,
    databaseName
  );

  let throughputSetting = "N/A";
  try {
    showStatusBarItem(localize("retrievingMongoDbDatabaseThroughput", "Retrieving mongodb database throughput..."));
    const rpResponse = await client.mongoDBResources.getMongoDBDatabaseThroughput(
      resourceGroupName,
      accountName,
      databaseName
    );

    if (rpResponse.resource) {
      throughputSetting = throughputSettingToString(rpResponse.resource);
    }
  } catch (e) {
    // Entity with the specified id does not exist in the system. More info: https://aka.ms/cosmosdb-tsg-not-found
  }
  hideStatusBarItem();

  const usageSizeKB = await getUsageSizeInKB(monitorARmClient, resourceUri, databaseName);

  return {
    name: databaseName,
    nbCollections: collections.length,
    throughputSetting,
    usageSizeKB,
  };
};

// const accountId = connectionInfo.options["azureAccount"];
export const getAccountName = (connectionInfo: azdata.ConnectionInfo): string => connectionInfo.options["server"];

export const retrieveMongoDbDatabasesInfoFromArm = async (
  connectionInfo: azdata.ConnectionInfo
): Promise<ICosmosDbDatabaseInfo[]> => {
  const client = await createArmClient(connectionInfo);
  const accountName = getAccountName(connectionInfo);
  const { resourceGroup } = parsedAzureResourceId(connectionInfo.options["azureResourceId"]);
  showStatusBarItem(localize("retrievingMongoDbDatabases", "Retrieving mongodb databases..."));
  const mongoDBResources = await client.mongoDBResources.listMongoDBDatabases(resourceGroup, accountName);
  hideStatusBarItem();
  const monitorArmClient = await createArmMonitorClient(connectionInfo);

  // TODO Error handling here for missing databaseName
  const promises = mongoDBResources
    .filter((resource) => !!resource.name)
    .map((resource) =>
      retrieveMongoDbDatabaseInfoFromArm(
        client,
        resourceGroup,
        accountName,
        resource.name!,
        monitorArmClient,
        connectionInfo.options["azureResourceId"]
      )
    );

  return await Promise.all(promises);
};

const retrieveMongoDbCollectionInfoFromArm = async (
  client: CosmosDBManagementClient,
  resourceGroupName: string,
  accountName: string,
  databaseName: string,
  collectionName: string,
  monitorARmClient: MonitorManagementClient,
  resourceUri: string
): Promise<ICosmosDbCollectionInfo> => {
  let throughputSetting = "N/A";
  try {
    const rpResponse = await client.mongoDBResources.getMongoDBCollectionThroughput(
      resourceGroupName,
      accountName,
      databaseName,
      collectionName
    );

    if (rpResponse.resource) {
      throughputSetting = throughputSettingToString(rpResponse.resource);
    }
  } catch (e) {
    // Entity with the specified id does not exist in the system. More info: https://aka.ms/cosmosdb-tsg-not-found
  }

  // Retrieve metrics
  const usageDataKB = await getUsageSizeInKB(monitorARmClient, resourceUri, databaseName, collectionName);
  const filter = `DatabaseName eq '${databaseName}' and CollectionName eq '${collectionName}'`;
  const metricnames = "DocumentCount";

  let documentCount;
  try {
    showStatusBarItem(localize("retrievingMongoDbUsage", "Retrieving mongodb usage..."));
    const metricsResponse = await monitorARmClient.metrics.list(resourceUri, { filter, metricnames });
    hideStatusBarItem();
    documentCount = metricsResponse.value[0].timeseries?.[0].data?.[0]?.total;
  } catch (e) {
    console.error(e);
  }

  return {
    name: collectionName,
    documentCount,
    throughputSetting,
    usageSizeKB: usageDataKB,
  };
};

export const retrieveMongoDbCollectionsInfoFromArm = async (
  connectionInfo: azdata.ConnectionInfo,
  databaseName: string
): Promise<ICosmosDbCollectionInfo[]> => {
  const client = await createArmClient(connectionInfo);
  const accountName = getAccountName(connectionInfo);
  const { resourceGroup } = parsedAzureResourceId(connectionInfo.options["azureResourceId"]);
  showStatusBarItem(localize("retrievingMongoDbUsage", "Retrieving mongodb usage..."));
  const mongoDBResources = await client.mongoDBResources.listMongoDBCollections(
    resourceGroup,
    accountName,
    databaseName
  );
  hideStatusBarItem();

  const monitorArmClient = await createArmMonitorClient(connectionInfo);

  // TODO Error handling here for missing databaseName
  const promises = mongoDBResources
    .filter((resource) => !!resource.name)
    .map((resource) =>
      retrieveMongoDbCollectionInfoFromArm(
        client,
        resourceGroup,
        accountName,
        databaseName,
        resource.name!,
        monitorArmClient,
        connectionInfo.options["azureResourceId"]
      )
    );

  return await Promise.all(promises);
};

interface SampleData {
  databaseId: string;
  collectionId: string;
  offerThroughput?: number;
  data: any[];
  databaseLevelThroughput?: boolean;
  createNewDatabase?: boolean;
  partitionKey?: {
    kind: string;
    paths: string[];
    version: number;
  };
}

export const isAzureconnection = (connectionInfo: azdata.ConnectionInfo): boolean =>
  connectionInfo.options["authenticationType"] === "AzureMFA";
