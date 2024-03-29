import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as azdata from "azdata";
import {
  CosmosDBManagementClient,
  SqlContainerCreateUpdateParameters,
  SqlDatabaseCreateUpdateParameters,
} from "@azure/arm-cosmosdb";
import { MonitorClient } from "@azure/arm-monitor";
import { getUsageSizeInKB } from "../Dashboards/getCollectionDataUsageSize";
import {
  IAzureCosmosDbContainerInfo,
  ICosmosDbCollectionInfo,
  ICosmosDbContainerInfoBase,
  ICosmosDbDatabaseInfo,
} from "../models";
import {
  createNewContainerDialog,
  createNewDatabaseDialog,
  NewContainerFormData,
  NewDatabaseFormData,
} from "../dialogUtil";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import { AbstractArmService, CdbContainerCreateInfo, azDataTokenToCoreAuthCredential } from "./AbstractArmService";

const localize = nls.loadMessageBundle();

export class ArmServiceNoSql extends AbstractArmService {
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
  private retrieveSqlDatabaseInfoFromArm = async (
    client: CosmosDBManagementClient,
    resourceGroupName: string,
    accountName: string,
    databaseName: string,
    monitorARmClient: MonitorClient,
    resourceUri: string,
    fetchThroughputOnly?: boolean
  ): Promise<ICosmosDbDatabaseInfo> => {
    let throughputSetting = "";
    let isAutoscale: boolean = false;
    let currentThroughput: number | undefined;
    try {
      showStatusBarItem(localize("retrievingSqlDatabaseThroughput", "Retrieving NoSql database throughput..."));
      const rpResponse = await client.sqlResources.getSqlDatabaseThroughput(
        resourceGroupName,
        accountName,
        databaseName
      );

      if (rpResponse.resource) {
        throughputSetting = this.throughputSettingToString(rpResponse.resource);
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

    showStatusBarItem(localize("retrievingSqlContainer", "Retrieving sql containers..."));
    let nbCollections = 0;
    for await (let page of client.sqlResources
      .listSqlContainers(resourceGroupName, accountName, databaseName)
      .byPage()) {
      for (const resource of page) {
        nbCollections++;
      }
    }

    showStatusBarItem(localize("retrievingSqlDatabaseThroughput", "Retrieving sql database usage..."));
    const usageSizeKB = await getUsageSizeInKB(monitorARmClient, resourceUri, databaseName);

    return {
      name: databaseName,
      nbCollections,
      throughputSetting,
      usageSizeKB,
      isAutoscale,
      currentThroughput,
    };
  };

  /**
   *
   * @param azureAccountId
   * @param azureTenantId
   * @param azureResourceId
   * @param cosmosDbAccountName
   * @param fetchThroughputOnly Optimization to not fetch everything
   * @returns
   */
  public retrieveDatabasesInfo = async (
    azureAccountId: string,
    azureTenantId: string,
    azureResourceId: string,
    cosmosDbAccountName: string,
    fetchThroughputOnly?: boolean
  ): Promise<ICosmosDbDatabaseInfo[]> => {
    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

    azureResourceId = await this.retrieveResourceId(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );

    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);

    showStatusBarItem(localize("retrievingSqlDatabases", "Retrieving sql databases..."));
    const sqlResources = [];
    for await (let page of client.sqlResources.listSqlDatabases(resourceGroup, cosmosDbAccountName).byPage()) {
      for (const sqlDatabaseGetResult of page) {
        sqlResources.push(sqlDatabaseGetResult);
      }
    }

    hideStatusBarItem();
    const monitorArmClient = await this.createArmMonitorClient(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );

    // TODO Error handling here for missing databaseName
    const promises = sqlResources
      .filter((resource) => !!resource.name)
      .map((resource) =>
        this.retrieveSqlDatabaseInfoFromArm(
          client,
          resourceGroup,
          cosmosDbAccountName,
          resource.name!,
          monitorArmClient,
          azureResourceId,
          fetchThroughputOnly
        )
      );

    return await Promise.all(promises).then((colls) => colls.sort((a, b) => a.name.localeCompare(b.name)));
  };

  private retrieveSqlContainerInfoFromArm = async (
    client: CosmosDBManagementClient,
    resourceGroupName: string,
    accountName: string,
    databaseName: string,
    collectionName: string,
    monitorARmClient: MonitorClient,
    resourceUri: string
  ): Promise<IAzureCosmosDbContainerInfo> => {
    let throughputSetting = "";
    let isAutoscale: boolean = false;
    let currentThroughput: number | undefined;
    try {
      const rpResponse = await client.sqlResources.getSqlContainerThroughput(
        resourceGroupName,
        accountName,
        databaseName,
        collectionName
      );

      if (rpResponse.resource) {
        throughputSetting = this.throughputSettingToString(rpResponse.resource);
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
      showStatusBarItem(localize("retrievingSqlUsage", "Retrieving sql usage..."));
      const metricsResponse = await monitorARmClient.metrics.list(resourceUri, { filter, metricnames });
      documentCount = metricsResponse.value[0].timeseries?.[0].data?.[0]?.total;
    } catch (e) {
      console.error(e);
    } finally {
      hideStatusBarItem();
    }

    // Retrieve shard key
    let partitionKey;
    try {
      showStatusBarItem(localize("retrievingSqlContainerInfo", "Retrieving NoSql container information..."));
      const collInfoResponse = await client.sqlResources.getSqlContainer(
        resourceGroupName,
        accountName,
        databaseName,
        collectionName
      );
      partitionKey = collInfoResponse.resource?.partitionKey;
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
      partitionKey: partitionKey?.paths?.join(","),
    };
  };

  public retrieveContainersInfo = async (
    azureAccountId: string,
    azureTenantId: string,
    azureResourceId: string,
    cosmosDbAccountName: string,
    databaseName: string
  ): Promise<IAzureCosmosDbContainerInfo[]> => {
    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);

    if (!azureResourceId) {
      const azureToken = await this.retrieveAzureToken(azureTenantId, azureAccountId);
      const credentials = azDataTokenToCoreAuthCredential(azureToken);

      const azureResource = await this.retrieveResourceInfofromArm(cosmosDbAccountName, credentials);
      if (!azureResource) {
        throw new Error(localize("azureResourceNotFound", "Azure Resource not found"));
      } else {
        azureResourceId = azureResource.id;
      }
    }
    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);

    showStatusBarItem(localize("retrievingSqlUsage", "Retrieving sql usage..."));
    const sqlResources = [];
    for await (let page of client.sqlResources
      .listSqlContainers(resourceGroup, cosmosDbAccountName, databaseName)
      .byPage()) {
      for (const sqlDatabaseGetResult of page) {
        sqlResources.push(sqlDatabaseGetResult);
      }
    }
    hideStatusBarItem();

    const monitorArmClient = await this.createArmMonitorClient(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );

    // TODO Error handling here for missing databaseName
    const promises = sqlResources
      .filter((resource) => !!resource.name)
      .map((resource) =>
        this.retrieveSqlContainerInfoFromArm(
          client,
          resourceGroup,
          cosmosDbAccountName,
          databaseName,
          resource.name!,
          monitorArmClient,
          azureResourceId
        )
      );

    return await Promise.all(promises).then((colls) => colls.sort((a, b) => a.name.localeCompare(b.name)));
  };

  public changeCollectionThroughput = async (
    azureAccountId: string,
    azureTenantId: string,
    azureResourceId: string,
    cosmosDbAccountName: string,
    databaseName: string,
    containerInfoBase: ICosmosDbContainerInfoBase
  ): Promise<boolean> => {
    const mode = await vscode.window.showQuickPick<any>(
      [
        {
          label: "Autoscale",
          onSelect: async (): Promise<boolean> => {
            if (containerInfoBase.isAutoscale) {
              vscode.window.showInformationMessage(localize("alreadySetToAutoscale", "Already set to Autoscale"));
              return false;
            } else {
              return await this.migrateSqlCollectionToAutoscale(
                azureAccountId,
                azureTenantId,
                azureResourceId,
                cosmosDbAccountName,
                databaseName,
                containerInfoBase.name
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

            if (containerInfoBase.currentThroughput === requestedThroughput) {
              vscode.window.showInformationMessage(
                localize("throughputAlreadySetAt", "Throughput already set at {0} RU", requestedThroughput)
              );
              return false;
            } else {
              return await this.updateSqlCollectionThroughput(
                azureAccountId,
                azureTenantId,
                azureResourceId,
                cosmosDbAccountName,
                databaseName,
                containerInfoBase.name,
                requestedThroughput,
                containerInfoBase.isAutoscale
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

  private migrateSqlCollectionToAutoscale = async (
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

    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await this.retrieveResourceId(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );
    // TODO: check resourceGroup here
    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);
    try {
      showStatusBarItem(localize("migratingCollectionToAutoscale", "Migrating collection to autoscale..."));
      const rpResponse = await client.sqlResources.beginMigrateSqlContainerToAutoscaleAndWait(
        resourceGroup,
        cosmosDbAccountName,
        databaseName,
        collectionName
      );

      return !!rpResponse;
    } catch (e) {
      return Promise.reject(e);
    } finally {
      hideStatusBarItem();
    }
  };

  private updateSqlCollectionThroughput = async (
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

    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await this.retrieveResourceId(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );
    // TODO: check resourceGroup here
    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);

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
        rpResponse = await client.sqlResources.beginMigrateSqlContainerToManualThroughputAndWait(
          resourceGroup,
          cosmosDbAccountName,
          databaseName,
          collectionName
        );
      }

      showStatusBarItem(
        localize("updatingCollectionThroughput", "Updating collection throughput to {0} RUs...", requestedThroughput)
      );
      rpResponse = await client.sqlResources.beginUpdateSqlContainerThroughputAndWait(
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

  public changeDatabaseThroughput = async (
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
              return await this.migrateSqlDatabaseToAutoscale(
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
              return await this.updateSqlDatabaseThroughput(
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

  private migrateSqlDatabaseToAutoscale = async (
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

    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await this.retrieveResourceId(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );
    // TODO: check resourceGroup here
    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);
    try {
      showStatusBarItem(localize("migratingDatabaseToAutoscale", "Migrating database to autoscale..."));
      const rpResponse = await client.sqlResources.beginMigrateSqlDatabaseToAutoscaleAndWait(
        resourceGroup,
        cosmosDbAccountName,
        databaseName
      );

      return !!rpResponse;
    } catch (e) {
      return Promise.reject(e);
    } finally {
      hideStatusBarItem();
    }
  };

  private updateSqlDatabaseThroughput = async (
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

    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await this.retrieveResourceId(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );
    // TODO: check resourceGroup here
    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);

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

        showStatusBarItem(
          localize("migratingDatabaseToManualThroughput", "Migrating database to manual throughput...")
        );
        rpResponse = await client.sqlResources.beginMigrateSqlDatabaseToManualThroughputAndWait(
          resourceGroup,
          cosmosDbAccountName,
          databaseName
        );
      }

      showStatusBarItem(
        localize("updatingDatabaseThroughput", "Updating database throughput to {0} RUs...", requestedThroughput)
      );
      rpResponse = await client.sqlResources.beginUpdateSqlDatabaseThroughputAndWait(
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

  public createDatabase = async (
    azureAccountId: string,
    azureTenantId: string,
    azureResourceId: string,
    cosmosDbAccountName: string,
    databaseName?: string
  ): Promise<{ databaseName: string }> => {
    return new Promise(async (resolve, reject) => {
      const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
      azureResourceId = await this.retrieveResourceId(
        azureAccountId,
        azureTenantId,
        azureResourceId,
        cosmosDbAccountName
      );
      // TODO: check resourceGroup here
      const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);

      const dialog = await createNewDatabaseDialog(async (inputData: NewDatabaseFormData) => {
        const createDbParams: SqlDatabaseCreateUpdateParameters = {
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
          showStatusBarItem(localize("creatingSqlDatabase", "Creating CosmosDB database"));
          const dbresult = await client.sqlResources
            .beginCreateUpdateSqlDatabaseAndWait(
              resourceGroup,
              cosmosDbAccountName,
              inputData.newDatabaseName,
              createDbParams
            )
            .catch((e: any) => reject(e));

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
   * Do not bring up UI if database and container are already specified
   * @param azureAccountId
   * @param azureTenantId
   * @param azureResourceId
   * @param cosmosDbAccountName
   * @param databaseName
   * @param containerName
   * @returns
   */
  public createDatabaseAndContainer = async (
    azureAccountId: string,
    azureTenantId: string,
    azureResourceId: string,
    cosmosDbAccountName: string,
    databaseName?: string,
    containerName?: string,
    cdbCreateInfo?: CdbContainerCreateInfo
  ): Promise<{ databaseName: string; containerName: string | undefined }> => {
    const client = await this.createArmClient(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName);
    azureResourceId = await this.retrieveResourceId(
      azureAccountId,
      azureTenantId,
      azureResourceId,
      cosmosDbAccountName
    );
    // TODO: check resourceGroup here
    const { resourceGroup } = this.parsedAzureResourceId(azureResourceId);

    showStatusBarItem(localize("retrievingExistingDatabases", "Retrieving existing databases"));
    const existingDatabases = (
      await this.retrieveDatabasesInfo(azureAccountId, azureTenantId, azureResourceId, cosmosDbAccountName, true)
    ).map((databasesInfo) => ({
      id: databasesInfo.name,
      isSharedThroughput: !!databasesInfo.throughputSetting,
    }));
    hideStatusBarItem();

    return new Promise(async (resolve, reject) => {
      const CONTAINER_DEFAULT_THROUGHPUT_RUPS = 400;

      const createDatabaseContainerCB = async (inputData: NewContainerFormData) => {
        try {
          showStatusBarItem(localize("creatingCosmosDbDatabase", "Creating CosmosDB database"));
          let newDatabaseName;
          if (inputData.isCreateNewDatabase) {
            // If database is shared throughput, we must create it separately, otherwise the
            // createUpdateSqlCollection() call will create a plain database for us
            if (inputData.newDatabaseInfo.isShareDatabaseThroughput) {
              const createDbParams: SqlDatabaseCreateUpdateParameters = {
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

              const dbresult = await client.sqlResources
                .beginCreateUpdateSqlDatabaseAndWait(
                  resourceGroup,
                  cosmosDbAccountName,
                  inputData.newDatabaseInfo.newDatabaseName,
                  createDbParams
                )
                .catch((e: any) => reject(e));

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

          if (inputData.newContainerName !== undefined && newDatabaseName !== undefined) {
            const createContainerParams: SqlContainerCreateUpdateParameters = {
              resource: {
                id: inputData.newContainerName,
              },
            };

            createContainerParams.resource.partitionKey = {
              paths: [inputData.partitionKey!],
              kind: "Hash",
            };

            if (inputData.isProvisionContainerThroughput) {
              if (inputData.isAutoScale) {
                createContainerParams.options = {
                  autoscaleSettings: {
                    maxThroughput: inputData.maxThroughputRUPS,
                  },
                };
              } else {
                createContainerParams.options = {
                  throughput: inputData.requiredThroughputRUPS,
                };
              }
            }

            showStatusBarItem(localize("creatingSqlContainer", "Creating CosmosDB NoSql container"));
            const createResult = await client.sqlResources
              .beginCreateUpdateSqlContainerAndWait(
                resourceGroup,
                cosmosDbAccountName,
                newDatabaseName,
                inputData.newContainerName,
                createContainerParams
              )
              .catch((e: any) => reject(e));

            if (!createResult || !createResult.resource?.id) {
              reject(localize("failedCreatingContainer", "Failed creating container"));
              return;
            }
            containerName = createResult.resource.id;
            resolve({ databaseName: newDatabaseName, containerName });
          }
          reject(localize("containerOrDatabaseNotSpecified", "Container or database not specified"));
        } catch (e) {
          reject(e);
        } finally {
          hideStatusBarItem();
        }
      };

      if (databaseName !== undefined && containerName !== undefined) {
        // If database and container are specified, do not bring up UI
        // Assumption is database already exists
        createDatabaseContainerCB({
          isCreateNewDatabase: false,
          existingDatabaseId: databaseName,
          newDatabaseInfo: {
            newDatabaseName: "",
            isShareDatabaseThroughput: false,
          },
          newContainerName: containerName,
          partitionKey: cdbCreateInfo?.partitionKey,
          isProvisionContainerThroughput: true,
          isAutoScale: false,
          maxThroughputRUPS: 0,
          requiredThroughputRUPS: cdbCreateInfo?.requiredThroughputRUPS ?? CONTAINER_DEFAULT_THROUGHPUT_RUPS,
        });
        return;
      }

      const dialog = await createNewContainerDialog(
        createDatabaseContainerCB,
        existingDatabases,
        databaseName,
        containerName
      );
      azdata.window.openDialog(dialog);
    });
  };
}
