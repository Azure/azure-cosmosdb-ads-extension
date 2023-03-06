import { Collection, Document, MongoClient, MongoClientOptions } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as azdata from "azdata";
import { ProviderId } from "../Providers/connectionProvider";
import { CosmosDBManagementClient, Database } from "@azure/arm-cosmosdb";
import { MonitorManagementClient } from "@azure/arm-monitor";
import { ResourceGraphClient } from "@azure/arm-resourcegraph";
import { TokenCredentials } from "@azure/ms-rest-js";
import {
  MongoDBCollectionCreateUpdateParameters,
  MongoDBDatabaseCreateUpdateParameters,
  ThroughputSettingsGetPropertiesResource,
} from "@azure/arm-cosmosdb/esm/models";
import { getServerState } from "../Dashboards/ServerUXStates";
import { getUsageSizeInKB } from "../Dashboards/getCollectionDataUsageSize";
import { buildMongoConnectionString } from "../Providers/connectionString";
import {
  convertToConnectionOptions,
  IConnectionOptions,
  ICosmosDbCollectionInfo,
  ICosmosDbDatabaseAccountInfo,
  ICosmosDbDatabaseInfo,
} from "../models";
import {
  createNewCollectionDialog,
  createNewDatabaseDialog,
  NewCollectionFormData,
  NewDatabaseFormData,
} from "../dialogUtil";
import { CdbCollectionCreateInfo } from "../sampleData/DataSamplesUtil";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import { askUserForConnectionProfile } from "./ServiceUtil";

const localize = nls.loadMessageBundle();

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

/**
 *
 * @param client
 * @param resourceGroupName
 * @param accountName
 * @param databaseName
 * @param monitorARmClient
 * @param resourceUri
 * @param fetchThroughputOnly meant as an optimization
 * @returns
 */
const retrieveMongoDbDatabaseInfoFromArm = async (
  client: CosmosDBManagementClient,
  resourceGroupName: string,
  accountName: string,
  databaseName: string,
  monitorARmClient: MonitorManagementClient,
  resourceUri: string,
  fetchThroughputOnly?: boolean
): Promise<ICosmosDbDatabaseInfo> => {
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
  if (fetchThroughputOnly) {
    return {
      name: databaseName,
      nbCollections: undefined,
      throughputSetting,
      usageSizeKB: undefined,
      isAutoscale,
      currentThroughput,
    };
  }

  showStatusBarItem(localize("retrievingMongoDbCollection", "Retrieving mongodb collections..."));
  const collections = await client.mongoDBResources.listMongoDBCollections(
    resourceGroupName,
    accountName,
    databaseName
  );

  showStatusBarItem(localize("retrievingMongoDbDatabaseThroughput", "Retrieving mongodb database usage..."));
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

/**
 *
 * @param azureAccountId
 * @param azureTenantId
 * @param azureResourceId
 * @param cosmosDbAccountName
 * @param fetchThroughputOnly Optimization to not fetch everything
 * @returns
 */
export const retrieveMongoDbDatabasesInfoFromArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  fetchThroughputOnly?: boolean
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
        azureResourceId,
        fetchThroughputOnly
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

export const createMongoDatabaseWithArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName?: string
): Promise<{ databaseName: string }> => {
  return new Promise(async (resolve, reject) => {
    const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    // TODO: check resourceGroup here
    const { resourceGroup } = parsedAzureResourceId(azureResourceId);

    const dialog = await createNewDatabaseDialog(async (inputData: NewDatabaseFormData) => {
      const createDbParams: MongoDBDatabaseCreateUpdateParameters = {
        resource: {
          id: inputData.newDatabaseName,
        },
      };

      if (inputData.isShareDatabaseThroughput) {
        if (inputData.isAutoScale) {
          createDbParams.options = {
            autoscaleSettings: {
              maxThroughput: inputData.databaseMaxThroughputRUPS,
            },
          };
        } else {
          createDbParams.options = {
            throughput: inputData.databaseRequiredThroughputRUPS,
          };
        }
      }

      try {
        showStatusBarItem(localize("creatingMongoDatabase", "Creating CosmosDB database"));
        const dbresult = await client.mongoDBResources
          .createUpdateMongoDBDatabase(resourceGroup, cosmosDbAccountName, inputData.newDatabaseName, createDbParams)
          .catch((e) => reject(e));

        if (!dbresult || !dbresult.resource?.id) {
          reject("Could not create database");
          return;
        }

        resolve({ databaseName: dbresult.resource.id });
      } catch (e) {
        reject(e);
      } finally {
        hideStatusBarItem();
      }
    }, databaseName);
    azdata.window.openDialog(dialog);
  });
};

/**
 * Do not bring up UI if database and collection are already specified
 * @param azureAccountId
 * @param azureTenantId
 * @param azureResourceId
 * @param cosmosDbAccountName
 * @param databaseName
 * @param collectionName
 * @returns
 */
export const createMongoDatabaseAndCollectionWithArm = async (
  azureAccountId: string,
  azureTenantId: string,
  azureResourceId: string,
  cosmosDbAccountName: string,
  databaseName?: string,
  collectionName?: string,
  cdbCreateInfo?: CdbCollectionCreateInfo
): Promise<{ databaseName: string; collectionName: string | undefined }> => {
  const client = await createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  azureResourceId = await retrieveResourceId(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
  // TODO: check resourceGroup here
  const { resourceGroup } = parsedAzureResourceId(azureResourceId);

  showStatusBarItem(localize("retrievingExistingDatabases", "Retrieving existing databases"));
  const existingDatabases = (
    await retrieveMongoDbDatabasesInfoFromArm(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName, true)
  ).map((databasesInfo) => ({
    id: databasesInfo.name,
    isSharedThroughput: !!databasesInfo.throughputSetting,
  }));
  hideStatusBarItem();

  return new Promise(async (resolve, reject) => {
    const COLLECTION_DEFAULT_THROUGHPUT_RUPS = 400;

    const createDatabaseCollectioNCB = async (inputData: NewCollectionFormData) => {
      try {
        showStatusBarItem(localize("creatingMongoCollection", "Creating CosmosDB database"));
        let newDatabaseName;
        if (inputData.isCreateNewDatabase) {
          // If database is shared throughput, we must create it separately, otherwise the
          // createUpdateMongoDBCollection() call will create a plain database for us
          if (inputData.newDatabaseInfo.isShareDatabaseThroughput) {
            const createDbParams: MongoDBDatabaseCreateUpdateParameters = {
              resource: {
                id: inputData.newDatabaseInfo.newDatabaseName,
              },
            };

            if (inputData.isAutoScale) {
              createDbParams.options = {
                autoscaleSettings: {
                  maxThroughput: inputData.maxThroughputRUPS,
                },
              };
            } else {
              createDbParams.options = {
                throughput: inputData.requiredThroughputRUPS,
              };
            }

            const dbresult = await client.mongoDBResources
              .createUpdateMongoDBDatabase(
                resourceGroup,
                cosmosDbAccountName,
                inputData.newDatabaseInfo.newDatabaseName,
                createDbParams
              )
              .catch((e) => reject(e));

            if (!dbresult || !dbresult.resource?.id) {
              reject(localize("failedCreatingDatabase", "Failed creating database"));
              return;
            }

            newDatabaseName = dbresult.resource.id;
          } else {
            newDatabaseName = inputData.newDatabaseInfo.newDatabaseName;
          }
        } else {
          newDatabaseName = inputData.existingDatabaseId;
        }

        if (inputData.newCollectionName !== undefined && newDatabaseName !== undefined) {
          const createCollParams: MongoDBCollectionCreateUpdateParameters = {
            resource: {
              id: inputData.newCollectionName,
            },
          };

          if (inputData.isSharded) {
            createCollParams.resource.shardKey = {
              [inputData.shardKey!]: "Hash",
            };
          }

          if (inputData.isProvisionCollectionThroughput) {
            if (inputData.isAutoScale) {
              createCollParams.options = {
                autoscaleSettings: {
                  maxThroughput: inputData.maxThroughputRUPS,
                },
              };
            } else {
              createCollParams.options = {
                throughput: inputData.requiredThroughputRUPS,
              };
            }
          }

          showStatusBarItem(localize("creatingMongoCollection", "Creating CosmosDB Mongo collection"));
          const collResult = await client.mongoDBResources
            .createUpdateMongoDBCollection(
              resourceGroup,
              cosmosDbAccountName,
              newDatabaseName,
              inputData.newCollectionName,
              createCollParams
            )
            .catch((e) => reject(e));

          if (!collResult || !collResult.resource?.id) {
            reject(localize("failedCreatingCollection", "Failed creating collection"));
            return;
          }
          collectionName = collResult.resource.id;
          resolve({ databaseName: newDatabaseName, collectionName });
        }
        reject(localize("collectionOrDatabaseNotSpecified", "Collection or database not specified"));
      } catch (e) {
        reject(e);
      } finally {
        hideStatusBarItem();
      }
    };

    if (databaseName !== undefined && collectionName !== undefined) {
      // If database and collection are specified, do not bring up UI
      // Assumption is database already exists
      createDatabaseCollectioNCB({
        isCreateNewDatabase: false,
        existingDatabaseId: databaseName,
        newDatabaseInfo: {
          newDatabaseName: "",
          isShareDatabaseThroughput: false,
        },
        newCollectionName: collectionName,
        isSharded: true,
        shardKey: cdbCreateInfo?.shardKey,
        isProvisionCollectionThroughput: true,
        isAutoScale: false,
        maxThroughputRUPS: 0,
        requiredThroughputRUPS: cdbCreateInfo?.requiredThroughputRUPS ?? COLLECTION_DEFAULT_THROUGHPUT_RUPS,
      });
      return;
    }

    const dialog = await createNewCollectionDialog(
      createDatabaseCollectioNCB,
      existingDatabases,
      databaseName,
      collectionName
    );
    azdata.window.openDialog(dialog);
  });
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
