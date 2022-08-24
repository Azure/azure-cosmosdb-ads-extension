import { Collection, Document, MongoClient, MongoClientOptions } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as azdata from "azdata";
import { ProviderId } from "./Providers/connectionProvider";
import { CosmosDBManagementClient } from "@azure/arm-cosmosdb";
import { MonitorManagementClient } from "@azure/arm-monitor";
import { ResourceGraphClient } from "@azure/arm-resourcegraph";
import { TokenCredentials } from "@azure/ms-rest-js";
import {
  MongoDBCollectionCreateUpdateParameters,
  MongoDBDatabaseCreateUpdateParameters,
  ThroughputSettingsGetPropertiesResource,
  ThroughputSettingsResource,
} from "@azure/arm-cosmosdb/esm/models";
import { getServerState } from "./Dashboards/ServerUXStates";
import { getUsageSizeInKB } from "./Dashboards/getCollectionDataUsageSize";
import { isCosmosDBAccount } from "./MongoShell/mongoUtils";
import { buildMongoConnectionString } from "./Providers/connectionString";
import {
  convertToConnectionOptions,
  IConnectionOptions,
  ICosmosDbCollectionInfo,
  ICosmosDbDatabaseAccountInfo,
  ICosmosDbDatabaseInfo,
  IDatabaseInfo,
  IMongoShellOptions,
} from "./models";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "./extension";
import { createNodePath } from "./Providers/objectExplorerNodeProvider";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { createNewCollectionDialog, NewCollectionFormData } from "./newCollectionDialog";

let statusBarItem: vscode.StatusBarItem | undefined = undefined;
const localize = nls.loadMessageBundle();

type ConnectionPick = azdata.connection.ConnectionProfile & vscode.QuickPickItem;

/**
 * Global context for app
 */
export class AppContext {
  public static readonly CONNECTION_INFO_KEY_PROP = "server"; // Unique key to store connection info against
  private _mongoClients = new Map<string, MongoClient>();
  public reporter: TelemetryReporter | undefined = undefined;

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

  public hasConnection(server: string): boolean {
    return this._mongoClients.has(server);
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

      const connectionString = await retrieveConnectionStringFromConnectionOptions(connectionOptions, true);

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
    connectionOptions: IConnectionOptions,
    databaseName?: string,
    collectionName?: string
  ): Promise<{ collection: Collection; databaseName: string }> {
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

      if (isAzureAuthType(connectionOptions.authenticationType)) {
        createMongoDbCollectionWithArm(
          connectionOptions.azureAccount,
          connectionOptions.azureTenantId,
          connectionOptions.azureResourceId,
          getAccountNameFromOptions(connectionOptions),
          databaseName!,
          collectionName
        );
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
          resolve({ collection, databaseName: databaseName! });
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
    collectionName: string
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
      const collection = await vscode.commands.executeCommand<Collection<Document>>(
        "cosmosdb-ads-extension.createMongoCollection",
        undefined,
        param,
        collectionName
      );

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
}

export const askUserForConnectionProfile = async (): Promise<ConnectionPick | undefined> => {
  const connections = await azdata.connection.getConnections();
  const picks: ConnectionPick[] = connections
    .filter((c) => c.providerId === ProviderId)
    .map((c) => ({
      ...c,
      label: c.connectionName || c.serverName,
    }));

  return vscode.window.showQuickPick<ConnectionPick>(picks, {
    placeHolder: localize("selectMongoAccount", "Select mongo account"),
  });
};

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

export const retrievePortalEndpoint = async (accountId: string): Promise<string> =>
  (await retrieveAzureAccount(accountId)).properties?.providerSettings?.settings?.portalEndpoint;

const retrieveAzureAccount = async (accountId: string): Promise<azdata.Account> => {
  showStatusBarItem(localize("retrievingAzureAccount", "Retrieving Azure Account..."));
  const accounts = (await azdata.accounts.getAllAccounts()).filter((a) => a.key.accountId === accountId);
  hideStatusBarItem();
  if (accounts.length < 1) {
    throw new Error(localize("noAzureAccountFound", "No azure account found"));
  }

  return accounts[0];
};

const retrieveAzureToken = async (
  tenantId: string,
  azureAccountId: string
): Promise<{ token: string; tokenType?: string | undefined }> => {
  const azureAccount = await retrieveAzureAccount(azureAccountId);

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

const parsedAzureResourceId = (
  azureResourceId: string
): { subscriptionId: string; resourceGroup: string; dbAccountName: string } => {
  // TODO Add error handling
  const parsedAzureResourceId = azureResourceId.split("/");
  return {
    subscriptionId: parsedAzureResourceId[2],
    resourceGroup: parsedAzureResourceId[4],
    dbAccountName: parsedAzureResourceId[8],
  };
};

/**
 * If AzureResourceId is not defined, retrieve from ARM
 * @param azureAccountId
 * @param azureTenantId
 * @param azureResourceId
 * @param cosmosDbAccountName
 * @returns
 */
export const retrieveResourceId = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string
): Promise<string> => {
  if (!azureResourceId) {
    const azureToken = await retrieveAzureToken(azureTenantId, azureAccountId);
    const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

    const azureResource = await retrieveResourceInfofromArm(cosmosDbAccountName, credentials);
    if (!azureResource) {
      throw new Error(localize("azureResourceNotFound", "Azure Resource not found"));
    } else {
      azureResourceId = azureResource.id;
    }
  }

  return azureResourceId;
};

const createArmClient = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string
): Promise<CosmosDBManagementClient> => {
  const azureAccount = await retrieveAzureAccount(azureAccountId);
  const armEndpoint = azureAccount.properties?.providerSettings?.settings?.armResource?.endpoint;

  if (!armEndpoint) {
    throw new Error(localize("failRetrieveArmEndpoint", "Unable to retrieve ARM endpoint"));
  }

  const azureToken = await retrieveAzureToken(azureTenantId, azureAccountId);
  const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

  if (!azureResourceId) {
    const azureResource = await retrieveResourceInfofromArm(cosmosDbAccountName, credentials);
    if (!azureResource) {
      throw new Error(localize("azureResourceNotFound", "Azure Resource not found"));
    } else {
      azureResourceId = azureResource.id;
    }
  }

  const { subscriptionId } = parsedAzureResourceId(azureResourceId);

  return new CosmosDBManagementClient(credentials, subscriptionId, { baseUri: armEndpoint });
};

const createArmMonitorClient = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string
): Promise<MonitorManagementClient> => {
  const azureAccount = await retrieveAzureAccount(azureAccountId);
  const armEndpoint = azureAccount.properties?.providerSettings?.settings?.armResource?.endpoint; // TODO Get the endpoint from the resource, not the aad account

  if (!armEndpoint) {
    throw new Error(localize("failRetrieveArmEndpoint", "Unable to retrieve ARM endpoint"));
  }

  const azureToken = await retrieveAzureToken(azureTenantId, azureAccountId);
  const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

  if (!azureResourceId) {
    const azureResource = await retrieveResourceInfofromArm(cosmosDbAccountName, credentials);
    if (!azureResource) {
      throw new Error(localize("azureResourceNotFound", "Azure Resource not found"));
    } else {
      azureResourceId = azureResource.id;
    }
  }

  const { subscriptionId } = parsedAzureResourceId(azureResourceId);

  return new MonitorManagementClient(credentials, subscriptionId, { baseUri: armEndpoint });
};

/**
 * use cosmosdb-arm to retrive connection string
 */
export const retrieveConnectionStringFromArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string
): Promise<string> => {
  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  showStatusBarItem(localize("retrievingConnectionString", "Retrieving connection string..."));
  const connectionStringsResponse = await client.databaseAccounts.listConnectionStrings(
    resourceGroup,
    cosmosDbAccountName
  );
  hideStatusBarItem();

  if (!connectionStringsResponse.connectionStrings) {
    throw new Error(localize("noConnectionStringsFound", "No Connection strings found for this account"));
  }

  // Pick first connection string
  const connectionString = connectionStringsResponse.connectionStrings[0].connectionString;

  if (!connectionString) {
    throw new Error(localize("missingConnectionString", "Error: missing connection string"));
  }
  return connectionString;
};

export const retrieveDatabaseAccountInfoFromArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string
): Promise<ICosmosDbDatabaseAccountInfo> => {
  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

  if (!azureResourceId) {
    const azureToken = await retrieveAzureToken(azureTenantId, azureAccountId);
    const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

    const azureResource = await retrieveResourceInfofromArm(cosmosDbAccountName, credentials);
    if (!azureResource) {
      throw new Error(localize("azureResourceNotFound", "Azure Resource not found"));
    } else {
      azureResourceId = azureResource.id;
    }
  }
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  showStatusBarItem(localize("retrievingDatabaseAccounts", "Retrieving database accounts..."));
  const databaseAccount = await client.databaseAccounts.get(resourceGroup, cosmosDbAccountName);
  hideStatusBarItem();
  return {
    serverStatus: getServerState(databaseAccount.provisioningState),
    backupPolicy: databaseAccount.backupPolicy?.type ?? localize("none", "None"),
    consistencyPolicy: databaseAccount.consistencyPolicy?.defaultConsistencyLevel ?? localize("none", "None"),
    location: databaseAccount.location ?? localize("unknown", "Unknown"),
    readLocations: databaseAccount.readLocations ? databaseAccount.readLocations.map((l) => l.locationName ?? "") : [],
    documentEndpoint: databaseAccount.documentEndpoint,
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

  let throughputSetting = "";
  let isAutoscale: boolean = false;
  let currentThroughput: number | undefined;
  try {
    showStatusBarItem(localize("retrievingMongoDbDatabaseThroughput", "Retrieving mongodb database throughput..."));
    const rpResponse = await client.mongoDBResources.getMongoDBDatabaseThroughput(
      resourceGroupName,
      accountName,
      databaseName
    );

    if (rpResponse.resource) {
      throughputSetting = throughputSettingToString(rpResponse.resource);
      isAutoscale = !!rpResponse.resource.autoscaleSettings;
      currentThroughput = rpResponse.resource.throughput;
    }
  } catch (e) {
    // Entity with the specified id does not exist in the system. More info: https://aka.ms/cosmosdb-tsg-not-found
  } finally {
    hideStatusBarItem();
  }

  const usageSizeKB = await getUsageSizeInKB(monitorARmClient, resourceUri, databaseName);

  return {
    name: databaseName,
    nbCollections: collections.length,
    throughputSetting,
    usageSizeKB,
    isAutoscale,
    currentThroughput,
  };
};

// TODO Find a better way to express this
export const getAccountName = (connectionInfo: azdata.ConnectionInfo): string => connectionInfo.options["server"];
export const getAccountNameFromOptions = (connectionOptions: IConnectionOptions): string => connectionOptions.server;

export const retrieveMongoDbDatabasesInfoFromArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string
): Promise<ICosmosDbDatabaseInfo[]> => {
  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  showStatusBarItem(localize("retrievingMongoDbDatabases", "Retrieving mongodb databases..."));
  const mongoDBResources = await client.mongoDBResources.listMongoDBDatabases(resourceGroup, cosmosDbAccountName);
  hideStatusBarItem();
  const monitorArmClient = await createArmMonitorClient(
    azureAccountId,
    azureTenantId,
    azureResourceId,
    cosmosDbAccountName
  );

  // TODO Error handling here for missing databaseName
  const promises = mongoDBResources
    .filter((resource) => !!resource.name)
    .map((resource) =>
      retrieveMongoDbDatabaseInfoFromArm(
        client,
        resourceGroup,
        cosmosDbAccountName,
        resource.name!,
        monitorArmClient,
        azureResourceId
      )
    );

  return await Promise.all(promises);
};

const retrieveResourceInfofromArm = async (
  cosmosDbAccountName: string,
  credentials: TokenCredentials
): Promise<{ subscriptionId: string; id: string } | undefined> => {
  const client = new ResourceGraphClient(credentials);
  const result = await client.resources(
    {
      query: `Resources | where type == "microsoft.documentdb/databaseaccounts" and name == "${cosmosDbAccountName}"`,
    },
    {
      $top: 1000,
      $skip: 0,
      $skipToken: "",
      resultFormat: "table",
    }
  );

  return result.data[0];
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
  let throughputSetting = "";
  let isAutoscale: boolean = false;
  let currentThroughput: number | undefined;
  try {
    const rpResponse = await client.mongoDBResources.getMongoDBCollectionThroughput(
      resourceGroupName,
      accountName,
      databaseName,
      collectionName
    );

    if (rpResponse.resource) {
      throughputSetting = throughputSettingToString(rpResponse.resource);
      isAutoscale = !!rpResponse.resource.autoscaleSettings;
      currentThroughput = rpResponse.resource.throughput;
    }
  } catch (e) {
    // Entity with the specified id does not exist in the system. More info: https://aka.ms/cosmosdb-tsg-not-found
    // Shared throughput case
  }

  // Retrieve metrics
  const usageDataKB = await getUsageSizeInKB(monitorARmClient, resourceUri, databaseName, collectionName);
  const filter = `DatabaseName eq '${databaseName}' and CollectionName eq '${collectionName}'`;
  const metricnames = "DocumentCount";

  let documentCount;
  try {
    showStatusBarItem(localize("retrievingMongoDbUsage", "Retrieving mongodb usage..."));
    const metricsResponse = await monitorARmClient.metrics.list(resourceUri, { filter, metricnames });
    documentCount = metricsResponse.value[0].timeseries?.[0].data?.[0]?.total;
  } catch (e) {
    console.error(e);
  } finally {
    hideStatusBarItem();
  }

  // Retrieve shard key
  let shardKey;
  try {
    showStatusBarItem(localize("retrievingMongoCollectionInfo", "Retrieving mongodb collection information..."));
    const collInfoResponse = await client.mongoDBResources.getMongoDBCollection(
      resourceGroupName,
      accountName,
      databaseName,
      collectionName
    );
    shardKey = collInfoResponse.resource?.shardKey;
  } catch (e) {
    console.error(e);
    // TODO Rethrow?
  } finally {
    hideStatusBarItem();
  }

  return {
    name: collectionName,
    documentCount,
    throughputSetting,
    usageSizeKB: usageDataKB,
    isAutoscale,
    currentThroughput,
    shardKey,
  };
};

export const retrieveMongoDbCollectionsInfoFromArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string
): Promise<ICosmosDbCollectionInfo[]> => {
  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

  if (!azureResourceId) {
    const azureToken = await retrieveAzureToken(azureTenantId, azureAccountId);
    const credentials = new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */);

    const azureResource = await retrieveResourceInfofromArm(cosmosDbAccountName, credentials);
    if (!azureResource) {
      throw new Error(localize("azureResourceNotFound", "Azure Resource not found"));
    } else {
      azureResourceId = azureResource.id;
    }
  }
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  showStatusBarItem(localize("retrievingMongoDbUsage", "Retrieving mongodb usage..."));
  const mongoDBResources = await client.mongoDBResources.listMongoDBCollections(
    resourceGroup,
    cosmosDbAccountName,
    databaseName
  );
  hideStatusBarItem();

  const monitorArmClient = await createArmMonitorClient(
    azureAccountId,
    azureTenantId,
    azureResourceId,
    cosmosDbAccountName
  );

  // TODO Error handling here for missing databaseName
  const promises = mongoDBResources
    .filter((resource) => !!resource.name)
    .map((resource) =>
      retrieveMongoDbCollectionInfoFromArm(
        client,
        resourceGroup,
        cosmosDbAccountName,
        databaseName,
        resource.name!,
        monitorArmClient,
        azureResourceId
      )
    );

  return await Promise.all(promises);
};

export const retrieveConnectionStringFromConnectionOptions = async (
  connectionOptions: IConnectionOptions,
  retrievePasswordFromAzData: boolean
): Promise<string | undefined> => {
  const authenticationType = connectionOptions.authenticationType;

  if (retrievePasswordFromAzData && (authenticationType === "SqlLogin" || authenticationType === "Integrated")) {
    // Retrieve password
    const serverName = connectionOptions.server;
    if (!serverName) {
      vscode.window.showErrorMessage(localize("missingServerName", "Missing serverName {0}", serverName));
      return undefined;
    }

    const connection = (await azdata.connection.getConnections()).filter((c) => c.serverName === serverName);
    if (connection.length < 1) {
      vscode.window.showErrorMessage(
        localize("failRetrieveCredentials", "Unable to retrieve credentials for {0}", serverName)
      );
      return undefined;
    }
    const credentials = await azdata.connection.getCredentials(connection[0].connectionId);
    connectionOptions.password = credentials["password"];
  }

  switch (authenticationType) {
    case "AzureMFA":
      try {
        return retrieveConnectionStringFromArm(
          connectionOptions.azureAccount,
          connectionOptions.azureTenantId,
          connectionOptions.azureResourceId,
          connectionOptions.server
        );
      } catch (e) {
        vscode.window.showErrorMessage((e as { message: string }).message);
        return undefined;
      }
    case "SqlLogin":
    case "Integrated":
      return buildMongoConnectionString(connectionOptions);
    default:
      // Should never happen
      vscode.window.showErrorMessage(
        localize("unsupportedAuthenticationType", "Unsupposed authentication type {0}", authenticationType)
      );
      return undefined;
  }
};

export const changeMongoDbCollectionThroughput = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string,
  collectionInfo: ICosmosDbCollectionInfo
): Promise<boolean> => {
  const mode = await vscode.window.showQuickPick<any>(
    [
      {
        label: "Autoscale",
        onSelect: async (): Promise<boolean> => {
          if (collectionInfo.isAutoscale) {
            vscode.window.showInformationMessage(localize("alreadySetToAutoscale", "Already set to Autoscale"));
            return false;
          } else {
            return await migrateMongoDbCollectionToAutoscale(
              azureAccountId,
              azureTenantId,
              azureResourceId,
              cosmosDbAccountName,
              databaseName,
              collectionInfo.name
            );
          }
        },
      },
      {
        label: localize("setThroughput", "Set throughput"),
        onSelect: async (): Promise<boolean> => {
          const requestedThroughputStr = await vscode.window.showInputBox({
            placeHolder: localize("enterThroughput", "Enter throughput (RU)"),
          });

          if (!requestedThroughputStr === undefined) {
            return false;
          }

          const requestedThroughput = Number.parseInt(requestedThroughputStr!);

          if (collectionInfo.currentThroughput === requestedThroughput) {
            vscode.window.showInformationMessage(
              localize("throughputAlreadySetAt", "Throughput already set at {0} RU", requestedThroughput)
            );
            return false;
          } else {
            return await updateMongoDbCollectionThroughput(
              azureAccountId,
              azureTenantId,
              azureResourceId,
              cosmosDbAccountName,
              databaseName,
              collectionInfo.name,
              requestedThroughput,
              collectionInfo.isAutoscale
            );
          }
        },
      },
    ],
    {
      placeHolder: localize("useAutoscaleOrSetThroughput", "Use Autoscale or set Throughput manually?"),
    }
  );

  if (!mode) {
    return false;
  }

  return await mode.onSelect();
};

const migrateMongoDbCollectionToAutoscale = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string,
  collectionName: string
): Promise<boolean> => {
  const response = await vscode.window.showInformationMessage(
    localize(
      "migrateCollectionToAutoscaleConfirm",
      "Are you sure you want to migrate the collection {0} to Autoscale?",
      collectionName
    ),
    ...[localize("yes", "Yes"), localize("no", "No")]
  );
  if (response !== "Yes") {
    return false;
  }

  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);
  try {
    showStatusBarItem(localize("migratingCollectionToAutoscale", "Migrating collection to autoscale..."));
    const rpResponse = await client.mongoDBResources.migrateMongoDBCollectionToAutoscale(
      resourceGroup,
      cosmosDbAccountName,
      databaseName,
      collectionName
    );

    return !!rpResponse;
  } catch (e) {
    Promise.reject(e);
    return false;
  } finally {
    hideStatusBarItem();
  }
};

const updateMongoDbCollectionThroughput = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string,
  collectionName: string,
  requestedThroughput: number,
  migrateToManualThroughput: boolean
): Promise<boolean> => {
  const response = await vscode.window.showInformationMessage(
    localize(
      "setManualThroughputCollectionConfirm",
      "Are you sure you want to set the collection {0} throughput to {1} RUs?",
      collectionName,
      requestedThroughput
    ),
    ...[localize("yes", "Yes"), localize("no", "No")]
  );
  if (response !== "Yes") {
    return false;
  }

  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  try {
    let rpResponse;
    if (migrateToManualThroughput) {
      const response = await vscode.window.showInformationMessage(
        localize(
          "migrateToManualThroughputCollectionConfirm",
          "Are you sure you want to migrate the collection {0} to manual throughput?",
          collectionName
        ),
        ...[localize("yes", "Yes"), localize("no", "No")]
      );
      if (response !== "Yes") {
        return false;
      }

      showStatusBarItem(
        localize("migratingCollectionToManualThroughput", "Migrating collection to manual throughput...")
      );
      rpResponse = await client.mongoDBResources.migrateMongoDBCollectionToManualThroughput(
        resourceGroup,
        cosmosDbAccountName,
        databaseName,
        collectionName,
        {
          resource: {
            throughput: requestedThroughput,
          },
        }
      );
    }

    showStatusBarItem(
      localize("updatingCollectionThroughput", "Updating collection throughput to {0} RUs...", requestedThroughput)
    );
    rpResponse = await client.mongoDBResources.updateMongoDBCollectionThroughput(
      resourceGroup,
      cosmosDbAccountName,
      databaseName,
      collectionName,
      {
        resource: {
          throughput: requestedThroughput,
        },
      }
    );

    return !!rpResponse;
  } catch (e) {
    return Promise.reject(e);
  } finally {
    hideStatusBarItem();
  }
};

export const changeMongoDbDatabaseThroughput = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseInfo: ICosmosDbDatabaseInfo
): Promise<boolean> => {
  const mode = await vscode.window.showQuickPick<any>(
    [
      {
        label: "Autoscale",
        onSelect: async (): Promise<boolean> => {
          if (databaseInfo.isAutoscale) {
            vscode.window.showInformationMessage(localize("alreadySetToAutoscale", "Already set to Autoscale"));
            return false;
          } else {
            return await migrateMongoDbDatabaseToAutoscale(
              azureAccountId,
              azureTenantId,
              azureResourceId,
              cosmosDbAccountName,
              databaseInfo.name
            );
          }
        },
      },
      {
        label: localize("setThroughput", "Set throughput"),
        onSelect: async (): Promise<boolean> => {
          const requestedThroughputStr = await vscode.window.showInputBox({
            placeHolder: localize("enterThroughput", "Enter throughput (RU)"),
          });

          if (!requestedThroughputStr === undefined) {
            return false;
          }

          const requestedThroughput = Number.parseInt(requestedThroughputStr!);

          if (databaseInfo.currentThroughput === requestedThroughput) {
            vscode.window.showInformationMessage(
              localize("throughputAlreadySetAt", "Throughput already set at {0} RU", requestedThroughput)
            );
            return false;
          } else {
            return await updateMongoDbDatabaseThroughput(
              azureAccountId,
              azureTenantId,
              azureResourceId,
              cosmosDbAccountName,
              databaseInfo.name,
              requestedThroughput,
              databaseInfo.isAutoscale
            );
          }
        },
      },
    ],
    {
      placeHolder: localize("useAutoscaleOrSetThroughput", "Use Autoscale or set Throughput manually?"),
    }
  );

  if (!mode) {
    return false;
  }

  return await mode.onSelect();
};

const migrateMongoDbDatabaseToAutoscale = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string
): Promise<boolean> => {
  const response = await vscode.window.showInformationMessage(
    localize(
      "migrateDatabaseToAutoscaleConfirm",
      "Are you sure you want to migrate the database {0} to Autoscale?",
      databaseName
    ),
    ...[localize("yes", "Yes"), localize("no", "No")]
  );
  if (response !== "Yes") {
    return false;
  }

  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);
  try {
    showStatusBarItem(localize("migratingDatabaseToAutoscale", "Migrating database to autoscale..."));
    const rpResponse = await client.mongoDBResources.migrateMongoDBDatabaseToAutoscale(
      resourceGroup,
      cosmosDbAccountName,
      databaseName
    );

    return !!rpResponse;
  } catch (e) {
    Promise.reject(e);
    return false;
  } finally {
    hideStatusBarItem();
  }
};

const updateMongoDbDatabaseThroughput = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string,
  requestedThroughput: number,
  migrateToManualThroughput: boolean
): Promise<boolean> => {
  const response = await vscode.window.showInformationMessage(
    localize(
      "setManualThroughputDatabaseConfirm",
      "Are you sure you want to set the database {0} throughput to {1} RUs?",
      databaseName,
      requestedThroughput
    ),
    ...[localize("yes", "Yes"), localize("no", "No")]
  );
  if (response !== "Yes") {
    return false;
  }

  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  try {
    let rpResponse;
    if (migrateToManualThroughput) {
      const response = await vscode.window.showInformationMessage(
        localize(
          "migrateToManualThroughputDatabaseConfirm",
          "Are you sure you want to migrate the database {0} to manual throughput?",
          databaseName
        ),
        ...[localize("yes", "Yes"), localize("no", "No")]
      );
      if (response !== "Yes") {
        return false;
      }

      showStatusBarItem(localize("migratingDatabaseToManualThroughput", "Migrating database to manual throughput..."));
      rpResponse = await client.mongoDBResources.migrateMongoDBDatabaseToManualThroughput(
        resourceGroup,
        cosmosDbAccountName,
        databaseName,
        {
          resource: {
            throughput: requestedThroughput,
          },
        }
      );
    }

    showStatusBarItem(
      localize("updatingDatabaseThroughput", "Updating database throughput to {0} RUs...", requestedThroughput)
    );
    rpResponse = await client.mongoDBResources.updateMongoDBDatabaseThroughput(
      resourceGroup,
      cosmosDbAccountName,
      databaseName,
      {
        resource: {
          throughput: requestedThroughput,
        },
      }
    );

    return !!rpResponse;
  } catch (e) {
    return Promise.reject(e);
  } finally {
    hideStatusBarItem();
  }
};

const createMongoDbCollectionWithArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName: string,
  collectionName: string
): Promise<boolean> => {
  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  const dialog = await createNewCollectionDialog(async (inputData: NewCollectionFormData) => {
    console.log("createMongoDbCollectionWithArm", inputData);

    const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

    const createDbParams: MongoDBDatabaseCreateUpdateParameters = {
      resource: {
        id: inputData.newDatabaseInfo.newDatabaseName,
      },
    };

    if (inputData.isCreateNewDatabase) {
      if (inputData.newDatabaseInfo.isAutoScale) {
        createDbParams.options = {
          autoscaleSettings: {
            maxThroughput: inputData.newDatabaseInfo.databaseMaxThroughputRUPS,
          },
        };
      } else {
        createDbParams.options = {
          throughput: inputData.newDatabaseInfo.databaseRequiredThroughputRUPS,
        };
      }
    }

    const dbresult = await client.mongoDBResources.createUpdateMongoDBDatabase(
      resourceGroup,
      cosmosDbAccountName,
      inputData.newDatabaseInfo.newDatabaseName,
      createDbParams
    );

    // TODO Add error handling
    console.log("createUpdateMongoDBDatabase", dbresult);

    const createCollParams: MongoDBCollectionCreateUpdateParameters = {
      resource: {
        id: inputData.newCollectionName,
      },
    };

    if (inputData.isSharded) {
      createCollParams.resource.shardKey = { [inputData.shardKey! /** TODO Add Validation!! */]: "Hash" };
    }

    const collResult = await client.mongoDBResources
      .createUpdateMongoDBCollection(
        resourceGroup,
        cosmosDbAccountName,
        inputData.newDatabaseInfo.newDatabaseName,
        inputData.newCollectionName,
        createCollParams
      )
      .catch((e) => console.error("Error", e));

    console.log("createUpdateMongoDBCollection", collResult);

    vscode.window.showInformationMessage(`Created collection`);
  });
  azdata.window.openDialog(dialog);

  return false;
  try {
    showStatusBarItem(localize("creatingMongoCollection", "Creating Mongo collection..."));
    const rpResponse = await client.mongoDBResources.beginCreateUpdateMongoDBCollection(
      resourceGroup,
      cosmosDbAccountName,
      databaseName,
      collectionName,
      {
        resource: {
          id: "blah",
        },
      } //createUpdateMongoDBCollectionParameters
    );

    return !!rpResponse;
  } catch (e) {
    Promise.reject(e);
    return false;
  } finally {
    hideStatusBarItem();
  }
};

export const openAccountDashboard = async (accountName: string) => {
  const connections = (await azdata.connection.getConnections()).filter((c) => c.serverName === accountName);
  if (connections.length < 1) {
    vscode.window.showErrorMessage(localize("noAccountFound", "No account found for {0}", accountName));
    return;
  }

  const connectionOptions = convertToConnectionOptions(connections[0]);

  if (connectionOptions.authenticationType === "SqlLogin" || connectionOptions.authenticationType === "Integrated") {
    const credentials = await azdata.connection.getCredentials(connections[0].connectionId);
    connectionOptions.password = credentials["password"];
  }

  const connectionProfile: azdata.IConnectionProfile = {
    ...connections[0],
    providerName: ProviderId,
    id: connections[0].connectionId,
    azureAccount: connectionOptions.azureAccount,
    azureTenantId: connectionOptions.azureTenantId,
    azureResourceId: connectionOptions.azureResourceId,
    password: connectionOptions.password,
  };
  await azdata.connection.connect(connectionProfile, false, true);
};

export interface NotebookServiceInfo {
  cosmosEndpoint: string;
  dbAccountName: string;
  aadToken: string;
  subscriptionId: string;
  resourceGroup: string;
  sessionToken: string | undefined;
}

/**
 *
 * @returns Only works for MFA
 */
export const getNbServiceInfo = async (): Promise<NotebookServiceInfo> => {
  return new Promise(async (resolve, reject) => {
    const connectionProfile = await askUserForConnectionProfile();
    if (!connectionProfile || connectionProfile.options["authenticationType"] !== "AzureMFA") {
      // TODO Show error here
      reject(localize("notAzureAccount", "Not an Azure account"));
      return;
    }

    const azureAccountId = connectionProfile.options["azureAccount"];
    const azureTenantId = connectionProfile.options["azureTenantId"];
    const cosmosDbAccountName = getAccountName(connectionProfile);
    let azureResourceId = connectionProfile.options["azureResourceId"];

    azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

    const { subscriptionId, resourceGroup, dbAccountName } = parsedAzureResourceId(azureResourceId);
    const azureToken = await retrieveAzureToken(azureTenantId, azureAccountId);
    const accountInfo = await retrieveDatabaseAccountInfoFromArm(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );

    if (!accountInfo.documentEndpoint) {
      reject(localize("missingDocumentEndpointFromAccountInfo", "Missing documentEndpoint from account information"));
      return;
    }

    resolve({
      cosmosEndpoint: accountInfo.documentEndpoint,
      dbAccountName,
      aadToken: azureToken.token,
      subscriptionId,
      resourceGroup,
      sessionToken: "1234",
    });
  });
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

export const isAzureConnection = (connectionInfo: azdata.ConnectionInfo): boolean =>
  isAzureAuthType(connectionInfo.options["authenticationType"]);

export const isAzureAuthType = (authenticationType: string | undefined): boolean => authenticationType === "AzureMFA";
