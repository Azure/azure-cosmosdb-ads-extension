"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as fs from "fs";

// The module 'azdata' contains the Azure Data Studio extensibility API
// This is a complementary set of APIs that add SQL / Data-specific functionality to the app
// Import the module and reference it with the alias azdata in your code below

import * as azdata from "azdata";
import { ConnectionProvider, MongoProviderId, NoSqlProviderId } from "./Providers/connectionProvider";
import { MongoIconProvider, NoSqlIconProvider } from "./Providers/iconProvider";
import {
  MongoObjectExplorerProvider,
  NoSqlObjectExplorerProvider,
  createNodePath,
  getNodeInfo,
} from "./Providers/objectExplorerNodeProvider";
import { AppContext, createStatusBarItem, hideStatusBarItem, showStatusBarItem } from "./appContext";
import { registerHomeDashboardTabs } from "./Dashboards/homeDashboard";
import { UriHandler } from "./protocol/UriHandler";
import { downloadMongoShell } from "./MongoShell/MongoShellUtil";
import { convertToConnectionOptions, IConnectionOptions } from "./models";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { getErrorMessage, getPackageInfo } from "./util";
import { EditorUserQuery } from "./QueryClient/messageContract";
import { askUserForConnectionProfile, isAzureConnection } from "./Services/ServiceUtil";
import { CosmosDbMongoDatabaseDashboard } from "./Dashboards/CosmosDbMongoDatabaseDashboard";
import { NativeMongoDatabaseDashboard } from "./Dashboards/NativeMongoDatabaseDashboard";
import { AzureCosmosDbNoSqlDatabaseDashboard } from "./Dashboards/AzureCosmosDbNoSqlDatabaseDashboard";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "./constant";
import { CosmosDbNoSqlDatabaseDashboard } from "./Dashboards/CosmosDbNoSqlDatabaseDashboard";
import { CdbCollectionCreateInfo, CdbContainerCreateInfo } from "./Services/AbstractArmService";
import { AbstractBackendService } from "./Services/AbstractBackendService";
import { CosmosDbNoSqlFileSystemProvider } from "./Providers/FileSystemProviders/CosmosDbNoSqlFileSystemProvider";
import { CosmosDbMongoFileSystemProvider } from "./Providers/FileSystemProviders/CosmosDbMongoFileSystemProvider";

const localize = nls.loadMessageBundle();
// uncomment to test
// let localize = nls.config({ locale: 'pseudo' })();

export interface HasConnectionProfile {
  connectionProfile: azdata.IConnectionProfile;
}

// Used to update the node tree
export interface IConnectionNodeInfo extends IConnectionOptions {
  connectionId: string;
  nodePath?: string;
}

export interface IDatabaseDashboardInfo extends IConnectionOptions {
  databaseName: string | undefined;
  connectionId: string;
}

export interface IMongoShellInfo extends IConnectionOptions {
  databaseName: string | undefined;
  serverName: string;
}

let appContext: AppContext;

export function activate(context: vscode.ExtensionContext) {
  const terminalMap = new Map<string, number>(); // terminal name <-> counter

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.createMongoDatabase",
      async (objectExplorerContext: azdata.ObjectExplorerContext, connectionNodeInfo: IConnectionNodeInfo) => {
        if (objectExplorerContext && !objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          Promise.reject();
          return;
        }

        if (objectExplorerContext) {
          const connectionProfile = objectExplorerContext.connectionProfile!;
          connectionNodeInfo = {
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: objectExplorerContext.nodeInfo?.nodePath,
          };
        }

        if (!connectionNodeInfo) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return;
          }

          connectionNodeInfo = {
            connectionId: connectionProfile.connectionId,
            ...convertToConnectionOptions(connectionProfile),
          };
        }

        try {
          // Creating a database requires creating a collection inside
          const { databaseName } = await appContext.mongoService.createMongoDatabase(connectionNodeInfo);
          if (databaseName) {
            vscode.window.showInformationMessage(
              localize("sucessfullyCreatedDatabase", "Successfully created database: {0}", databaseName)
            );
            mongoObjectExplorer.updateNode(connectionNodeInfo.connectionId, connectionNodeInfo.server);
            Promise.resolve();
            return;
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failedCreatedDatabase", "Failed to create mongo database")}: ${e})`
          );
        }
        Promise.reject();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.createNoSqlDatabase",
      async (objectExplorerContext: azdata.ObjectExplorerContext, connectionNodeInfo: IConnectionNodeInfo) => {
        if (objectExplorerContext && !objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          Promise.reject();
          return;
        }

        if (objectExplorerContext) {
          const connectionProfile = objectExplorerContext.connectionProfile!;
          connectionNodeInfo = {
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: objectExplorerContext.nodeInfo?.nodePath,
          };
        }

        if (!connectionNodeInfo) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return;
          }

          connectionNodeInfo = {
            connectionId: connectionProfile.connectionId,
            ...convertToConnectionOptions(connectionProfile),
          };
        }

        try {
          // Creating a database requires creating a collection inside
          const { databaseName } = await appContext.cosmosDbNoSqlService.createNoSqlDatabase(connectionNodeInfo);
          if (databaseName) {
            vscode.window.showInformationMessage(
              localize("sucessfullyCreatedDatabase", "Successfully created database: {0}", databaseName)
            );
            noSqlObjectExplorer.updateNode(connectionNodeInfo.connectionId, connectionNodeInfo.server);
            Promise.resolve();
            return;
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failedCreatedDatabase", "Failed to create mongo database")}: ${e})`
          );
        }
        Promise.reject();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.createMongoCollection",
      async (
        objectExplorerContext: azdata.ObjectExplorerContext,
        connectionNodeInfo: IConnectionNodeInfo,
        collectionName?: string,
        cdbCreateInfo?: CdbCollectionCreateInfo
      ): Promise<{ databaseName: string; collectionName: string }> => {
        if (objectExplorerContext && !objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return Promise.reject();
        }

        if (objectExplorerContext && !objectExplorerContext.nodeInfo) {
          vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
          return Promise.reject();
        }

        if (objectExplorerContext) {
          const connectionProfile = objectExplorerContext.connectionProfile!;
          connectionNodeInfo = {
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: objectExplorerContext.nodeInfo?.nodePath,
          };
        }

        if (!connectionNodeInfo) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          connectionNodeInfo = {
            connectionId: connectionProfile.connectionId,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: createNodePath(connectionProfile.serverName),
          };
        }

        const { databaseName } = getNodeInfo(connectionNodeInfo.nodePath!);

        try {
          const createResult = await appContext.mongoService.createMongoDatabaseAndCollection(
            connectionNodeInfo,
            databaseName,
            collectionName,
            cdbCreateInfo
          );
          if (createResult.collectionName) {
            vscode.window.showInformationMessage(
              localize("successCreateCollection", "Successfully created collection: {0}", createResult.collectionName)
            );
            mongoObjectExplorer.updateNode(connectionNodeInfo.connectionId, connectionNodeInfo.nodePath);
            return Promise.resolve({ ...createResult, collectionName: createResult.collectionName! });
          }
        } catch (e) {
          vscode.window.showErrorMessage(`${localize("failedCreateCollection", "Failed to create collection")}: ${e}`);
          return Promise.reject();
        }
        vscode.window.showErrorMessage(localize("failedCreateCollection", "Failed to create collection"));
        return Promise.reject();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.createNoSqlContainer",
      async (
        objectExplorerContext: azdata.ObjectExplorerContext,
        connectionNodeInfo: IConnectionNodeInfo,
        containerName?: string,
        cdbCreateInfo?: CdbContainerCreateInfo
      ): Promise<{ databaseName: string; containerName: string }> => {
        if (objectExplorerContext && !objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return Promise.reject();
        }

        if (objectExplorerContext && !objectExplorerContext.nodeInfo) {
          vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
          return Promise.reject();
        }

        if (objectExplorerContext) {
          const connectionProfile = objectExplorerContext.connectionProfile!;
          connectionNodeInfo = {
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: objectExplorerContext.nodeInfo?.nodePath,
          };
        }

        if (!connectionNodeInfo) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          connectionNodeInfo = {
            connectionId: connectionProfile.connectionId,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: createNodePath(connectionProfile.serverName),
          };
        }

        const { databaseName } = getNodeInfo(connectionNodeInfo.nodePath!);

        try {
          const createResult = await appContext.cosmosDbNoSqlService.createCosmosDatabaseAndContainer(
            connectionNodeInfo,
            databaseName,
            containerName,
            cdbCreateInfo
          );
          if (createResult.containerName) {
            vscode.window.showInformationMessage(
              localize("successCreateCollection", "Successfully created: {0}", createResult.containerName)
            );
            mongoObjectExplorer.updateNode(connectionNodeInfo.connectionId, connectionNodeInfo.nodePath);
            return Promise.resolve({ ...createResult, containerName: createResult.containerName! });
          }
        } catch (e) {
          vscode.window.showErrorMessage(`${localize("failedCreateContainer", "Failed to create container")}: ${e}`);
          return Promise.reject();
        }
        vscode.window.showErrorMessage(localize("failedCreateContainer", "Failed to create container"));
        return Promise.reject();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.deleteMongoDatabase",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        if (!objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return;
        }

        const { serverName } = objectExplorerContext.connectionProfile;
        if (!objectExplorerContext.nodeInfo) {
          vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const mongoInfo = getNodeInfo(nodePath);

        const response = await vscode.window.showInputBox({
          placeHolder: localize("removeDatabaseConfirm", "Please enter the name of the database to delete"),
        });

        if (response !== mongoInfo.databaseName) {
          vscode.window.showErrorMessage(
            localize(
              "incorrectDeleteDatabase",
              "Incorrect name supplied to delete database {0}",
              mongoInfo.databaseName
            )
          );
          return;
        }

        try {
          if (await appContext.mongoService.removeDatabase(serverName, mongoInfo.databaseName!)) {
            // update parent node
            await mongoObjectExplorer.updateNode(
              objectExplorerContext.connectionProfile.id,
              objectExplorerContext.connectionProfile.serverName
            );
            vscode.window.showInformationMessage(
              localize("successDeleteDatabase", "Successfully deleted database {0}", mongoInfo.databaseName)
            );
          } else {
            vscode.window.showErrorMessage(
              localize("failedDeleteDatabase", "Failed to delete database {0}", mongoInfo.databaseName)
            );
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failedDeleteDatabase", "Failed to delete database {0}", mongoInfo.databaseName)}: ${e}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.deleteNoSqlDatabase",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        if (!objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return;
        }

        const { serverName } = objectExplorerContext.connectionProfile;
        if (!objectExplorerContext.nodeInfo) {
          vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const nodeInfo = getNodeInfo(nodePath);

        const response = await vscode.window.showInputBox({
          placeHolder: localize("removeDatabaseConfirm", "Please enter the name of the database to delete"),
        });

        if (response !== nodeInfo.databaseName) {
          vscode.window.showErrorMessage(
            localize("incorrectDeleteDatabase", "Incorrect name supplied to delete database {0}", nodeInfo.databaseName)
          );
          return;
        }

        try {
          if (await appContext.cosmosDbNoSqlService.removeDatabase(serverName, nodeInfo.databaseName!)) {
            // update parent node
            await noSqlObjectExplorer.updateNode(
              objectExplorerContext.connectionProfile.id,
              objectExplorerContext.connectionProfile.serverName
            );
            vscode.window.showInformationMessage(
              localize("successDeleteDatabase", "Successfully deleted database {0}", nodeInfo.databaseName)
            );
          } else {
            vscode.window.showErrorMessage(
              localize("failedDeleteDatabase", "Failed to delete database {0}", nodeInfo.databaseName)
            );
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failedDeleteDatabase", "Failed to delete database {0}", nodeInfo.databaseName)}: ${e}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.deleteMongoCollection",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        if (!objectExplorerContext.connectionProfile) {
          // TODO handle error;
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return;
        }
        const { id: connectionId, serverName } = objectExplorerContext.connectionProfile;

        // TODO FIX THIS
        if (!objectExplorerContext.nodeInfo) {
          // TODO handle error;
          vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const mongoInfo = getNodeInfo(nodePath);

        const response = await vscode.window.showInputBox({
          placeHolder: localize("removeCollectionConfirm", "Please enter the name of the collection to delete"),
        });

        if (response !== mongoInfo.containerName) {
          vscode.window.showErrorMessage(
            localize(
              "incorrectDeleteCollection",
              "Incorrect name supplied to delete collection {0}",
              mongoInfo.containerName
            )
          );
          return;
        }

        try {
          if (
            await appContext.mongoService.removeCollection(
              serverName,
              mongoInfo.databaseName!,
              mongoInfo.containerName!
            )
          ) {
            // Find parent node to update
            const { serverName, databaseName } = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
            const newNodePath = createNodePath(serverName, databaseName);
            await mongoObjectExplorer.updateNode(objectExplorerContext.connectionProfile.id, newNodePath);
            vscode.window.showInformationMessage(
              localize("successDeleteCollection", "Successfully deleted collection {0}", mongoInfo.containerName)
            );
          } else {
            vscode.window.showErrorMessage(
              localize("failDeleteCollection", "Failed to delete collection {0}", mongoInfo.containerName)
            );
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failDeleteCollection", "Failed to delete collection {0}:", mongoInfo.containerName)}: ${e}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.deleteNoSqlContainer",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        if (!objectExplorerContext.connectionProfile) {
          // TODO handle error;
          vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
          return;
        }
        const { id: connectionId, serverName } = objectExplorerContext.connectionProfile;

        // TODO FIX THIS
        if (!objectExplorerContext.nodeInfo) {
          // TODO handle error;
          vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const nodeInfo = getNodeInfo(nodePath);

        const response = await vscode.window.showInputBox({
          placeHolder: localize("removeContainerConfirm", "Please enter the name of the container to delete"),
        });

        if (response !== nodeInfo.containerName) {
          vscode.window.showErrorMessage(
            localize(
              "incorrectDeleteContainer",
              "Incorrect name supplied to delete container {0}",
              nodeInfo.containerName
            )
          );
          return;
        }

        try {
          if (
            await appContext.cosmosDbNoSqlService.removeContainer(
              serverName,
              nodeInfo.databaseName!,
              nodeInfo.containerName!
            )
          ) {
            // Find parent node to update
            const { serverName, databaseName } = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
            const newNodePath = createNodePath(serverName, databaseName);
            await mongoObjectExplorer.updateNode(objectExplorerContext.connectionProfile.id, newNodePath);
            vscode.window.showInformationMessage(
              localize("successDeleteCollection", "Successfully deleted collection {0}", nodeInfo.containerName)
            );
          } else {
            vscode.window.showErrorMessage(
              localize("failDeleteCollection", "Failed to delete collection {0}", nodeInfo.containerName)
            );
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failDeleteCollection", "Failed to delete collection {0}:", nodeInfo.containerName)}: ${e}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openMongoDatabaseDashboard",
      (objectExplorerContext: azdata.ObjectExplorerContext, databaseDashboardInfo?: IDatabaseDashboardInfo) => {
        if (objectExplorerContext?.connectionProfile) {
          // Called from menu tree item context menu

          if (!objectExplorerContext.nodeInfo) {
            // TODO handle error;
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return;
          }

          const nodeInfo = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
          const connectionProfile = objectExplorerContext.connectionProfile;
          databaseDashboardInfo = {
            databaseName: nodeInfo.databaseName,
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
          };
        } else {
          // Called from extension code
          if (!databaseDashboardInfo) {
            vscode.window.showErrorMessage(
              localize("missingConnectionProfile", "Missing ConnectionProfile or azureAccountId")
            );
            return;
          }
        }

        // TODO ask for database if databaseName not defined

        if (!databaseDashboardInfo.databaseName) {
          vscode.window.showErrorMessage(localize("missingDatabaseName", "Database not specified"));
          return;
        }

        const databaseDashboard =
          isAzureConnection(databaseDashboardInfo) && !databaseDashboardInfo.isServer
            ? new CosmosDbMongoDatabaseDashboard(MongoProviderId, appContext.armServiceMongo)
            : new NativeMongoDatabaseDashboard(MongoProviderId);
        databaseDashboard.openDatabaseDashboard(databaseDashboardInfo, appContext, context);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openNoSqlDatabaseDashboard",
      (objectExplorerContext: azdata.ObjectExplorerContext, databaseDashboardInfo?: IDatabaseDashboardInfo) => {
        if (objectExplorerContext?.connectionProfile) {
          // Called from menu tree item context menu

          if (!objectExplorerContext.nodeInfo) {
            // TODO handle error;
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return;
          }

          const nodeInfo = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
          const connectionProfile = objectExplorerContext.connectionProfile;
          databaseDashboardInfo = {
            databaseName: nodeInfo.databaseName,
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
          };
        } else {
          // Called from extension code
          if (!databaseDashboardInfo) {
            vscode.window.showErrorMessage(
              localize("missingConnectionProfile", "Missing ConnectionProfile or azureAccountId")
            );
            return;
          }
        }

        // TODO ask for database if databaseName not defined

        if (!databaseDashboardInfo.databaseName) {
          vscode.window.showErrorMessage(localize("missingDatabaseName", "Database not specified"));
          return;
        }

        isAzureConnection(databaseDashboardInfo)
          ? new AzureCosmosDbNoSqlDatabaseDashboard(NoSqlProviderId, appContext.armServiceNoSql).openDatabaseDashboard(
              databaseDashboardInfo,
              appContext,
              context
            )
          : new CosmosDbNoSqlDatabaseDashboard(NoSqlProviderId, appContext.cosmosDbNoSqlService).openDatabaseDashboard(
              databaseDashboardInfo,
              appContext,
              context
            );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openMongoQuery",
      async (
        objectExplorerContext: azdata.ObjectExplorerContext,
        connectionOptions?: IConnectionOptions,
        databaseName?: string,
        collectionName?: string) => {
        if (objectExplorerContext) {
          // Opened from tree item context menu
          if (!objectExplorerContext.connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          if (!objectExplorerContext.nodeInfo) {
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return Promise.reject();
          }

          connectionOptions = convertToConnectionOptions(objectExplorerContext.connectionProfile!);
          const nodeInfo = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
          databaseName = nodeInfo.databaseName;
          collectionName = nodeInfo.containerName;
        }

        if (!connectionOptions) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          connectionOptions = convertToConnectionOptions(connectionProfile);

          if (!connectionOptions) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }
        }

        if (!databaseName || !collectionName) {
          // TODO ask user for database and collection
          vscode.window.showErrorMessage(localize("missingDatabaseName", "Database not specified"));
          return Promise.reject();
        }

        const server = connectionOptions.server;
        const view = appContext.getViewLoader(server, databaseName, collectionName, {
          extensionPath: context.extensionPath,
          title: collectionName,
          onReady: () => {
            view.sendCommand({
              type: "initialize",
              data: {
                connectionId: connectionOptions!.server,
                databaseName: databaseName!,
                containerName: collectionName!,
                pagingType: "offset",
                defaultQueryText: "{}",
              },
            });
          },
          onQuerySubmit: async (query: EditorUserQuery) => {
            try {
              const queryResult = await appContext.mongoService.submitQuery(
                connectionOptions!,
                databaseName!,
                collectionName!,
                query
              );
              view.sendCommand({
                type: "queryResult",
                data: queryResult,
              });
            } catch (e) {
              vscode.window.showErrorMessage(getErrorMessage(e));
            }
          },
          onQueryCancel: () => {
            // no op
          },
          onCreateNewDocument: () => {
            const fileUri = vscode.Uri.parse(
              `${CosmosDbMongoFileSystemProvider.SCHEME}:/${server}/${databaseName}/${collectionName}/${CosmosDbMongoFileSystemProvider.NEW_DOCUMENT_FILENAME}`
            );
            cosmosDbMongoFileSystemProvider.writeFile(
              fileUri,
              Buffer.from(
                `{
  "id": "replace_with_new_document_id"
}`
              ),
              { create: true, overwrite: true }
            );
            vscode.commands.executeCommand(
              "vscode.open",
              fileUri,
              vscode.ViewColumn.Beside,
              localize("cosmosDbNewDocument", "Cosmos DB: New Document")
            );
          },
          onDidDispose: () => {
            appContext.removeViewLoader(server, databaseName!, collectionName!);
          },
        });
        view.reveal();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openNoSqlQuery",
      async (
        objectExplorerContext: azdata.ObjectExplorerContext,
        connectionOptions?: IConnectionOptions,
        databaseName?: string,
        containerName?: string
      ) => {
        if (objectExplorerContext) {
          // Opened from tree item context menu
          if (!objectExplorerContext.connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          if (!objectExplorerContext.nodeInfo) {
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return Promise.reject();
          }

          connectionOptions = convertToConnectionOptions(objectExplorerContext.connectionProfile!);
          const nodeInfo = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
          databaseName = nodeInfo.databaseName;
          containerName = nodeInfo.containerName;
        }

        if (!connectionOptions) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          connectionOptions = convertToConnectionOptions(connectionProfile);

          if (!connectionOptions) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }
        }

        if (!databaseName || !containerName) {
          // TODO ask user for database and collection
          vscode.window.showErrorMessage(localize("missingDatabaseName", "Database not specified"));
          return Promise.reject();
        }

        // Cache
        const server = connectionOptions.server;

        let tokenId: number | undefined = undefined;
        const view = appContext.getViewLoader(server, databaseName, containerName, {
          extensionPath: context.extensionPath,
          title: containerName,
          onReady: () => {
            view.sendCommand({
              type: "initialize",
              data: {
                connectionId: connectionOptions!.server,
                databaseName: databaseName!,
                containerName: containerName!,
                pagingType: "infinite",
                defaultQueryText: "select * from c",
              },
            });
          },
          onQuerySubmit: async (query: EditorUserQuery) => {
            tokenId = await appContext.cosmosDbNoSqlService.generateCancelationToken(connectionOptions!);

            showStatusBarItem(localize("runningQuery", "Running query..."));
            console.log("submitquery", query);
            view.sendCommand({
              type: "setProgress",
              data: true,
            });
            try {
              const queryResult = await appContext.cosmosDbNoSqlService.submitQuery(
                connectionOptions!,
                databaseName!,
                containerName!,
                query,
                tokenId
              );

              if (queryResult.documents === undefined) {
                vscode.window.showErrorMessage(localize("queryFailed", "Query failed"));
                return;
              }

              if (query.pagingInfo.kind === "infinite" && query.pagingInfo.continuationToken) {
                const cachedResultDocuments = appContext.getCachedQueryResultDocuments(
                  server,
                  databaseName!,
                  containerName!
                );
                if (cachedResultDocuments) {
                  queryResult.documents = cachedResultDocuments!.concat(queryResult.documents);
                }
              }
              appContext.setCachedQueryResultDocuments(server, databaseName!, containerName!, queryResult.documents);

              console.log("query # results:", queryResult.documents.length, queryResult.pagingInfo);
              view.sendCommand({
                type: "queryResult",
                data: queryResult,
              });
            } catch (e) {
              vscode.window.showErrorMessage(getErrorMessage(e));
            } finally {
              hideStatusBarItem();
              view.sendCommand({
                type: "setProgress",
                data: false,
              });
            }
          },
          onQueryCancel: () => {
            if (tokenId === undefined) {
              vscode.window.showErrorMessage(localize("TokenIdNotInitialized", "Token Id is not initialized"));
              return;
            }
            // Cancel query and set progress to undefined
            vscode.window.showInformationMessage(localize("CancelingQueryRequested", "Canceling query requested"));
            appContext.cosmosDbNoSqlService.cancelToken(connectionOptions!, tokenId);
          },
          onCreateNewDocument: () => {
            const fileUri = vscode.Uri.parse(
              `${CosmosDbNoSqlFileSystemProvider.SCHEME}:/${server}/${databaseName}/${containerName}/${CosmosDbNoSqlFileSystemProvider.NEW_DOCUMENT_FILENAME}`
            );
            cosmosDbNoSqlFileSystemProvider.writeFile(
              fileUri,
              Buffer.from(
                `{
  "id": "replace_with_new_document_id"
}`
              ),
              { create: true, overwrite: true }
            );
            vscode.commands.executeCommand(
              "vscode.open",
              fileUri,
              vscode.ViewColumn.Beside,
              localize("cosmosDbNewDocument", "Cosmos DB: New Document")
            );
          },
          onDidDispose: () => {
            appContext.removeViewLoader(server, databaseName!, containerName!);
          },
        });
        view.reveal();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cosmosdb-ads-extension.saveToCosmosDb", async () => {
      if (!vscode.window.activeTextEditor) {
        return; // no editor
      }
      const { document } = vscode.window.activeTextEditor;
      if (document.uri.scheme !== CosmosDbNoSqlFileSystemProvider.SCHEME) {
        return;
      }

      // Force save
      await document.save();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openMongoShell",
      async (objectExplorerContext: azdata.ObjectExplorerContext, mongoShellInfo?: IMongoShellInfo) => {
        if (objectExplorerContext?.connectionProfile) {
          // Called from menu tree item context menu

          const connectionProfile = objectExplorerContext.connectionProfile;
          mongoShellInfo = {
            databaseName: undefined,
            serverName: connectionProfile.serverName,
            ...convertToConnectionOptions(connectionProfile),
          };

          if (objectExplorerContext.nodeInfo) {
            const nodeInfo = getNodeInfo(objectExplorerContext.nodeInfo.nodePath);
            mongoShellInfo.databaseName = nodeInfo.databaseName;
          }
        } else {
          // Called from extension code
          if (!mongoShellInfo) {
            vscode.window.showErrorMessage(localize("missingMongoShellInfo", "Missing mongo shell information"));
            return;
          }
        }

        const terminalName = `${mongoShellInfo.serverName}${
          mongoShellInfo.databaseName ? "/" + mongoShellInfo.databaseName : ""
        }`;

        let counter = terminalMap.get(terminalName) ?? -1;
        const isTerminalOpen = terminalMap.size > 0;
        terminalMap.set(terminalName, ++counter);

        // Download mongosh
        let executablePath;
        try {
          showStatusBarItem(localize("downloadingMongoShell", "Downloading mongo shell..."));
          executablePath = await downloadMongoShell(context.extensionPath);

          switch (process.platform) {
            case "darwin":
            case "linux":
              await fs.promises.chmod(executablePath, "755");
              break;
          }
          hideStatusBarItem();
        } catch (e) {
          if (!executablePath) {
            vscode.window.showErrorMessage(
              `${localize("failInstallMongoShell", "Unable to install mongo shell")}: ${e}`
            );
            return;
          }
        }

        if (!executablePath) {
          vscode.window.showErrorMessage(localize("failInstallMongoShell", "Unable to install mongo shell"));
          return;
        }
        const mongoShellOptions = await appContext.mongoService.getMongoShellOptions(mongoShellInfo);

        const terminalOptions: vscode.TerminalOptions = {
          name: `Mongo Shell: ${terminalName}-${counter}`,
          shellPath: executablePath,
          isTransient: true,
        };
        if (mongoShellOptions) {
          terminalOptions.shellArgs = undefined;
          if (mongoShellOptions.connectionString !== undefined) {
            terminalOptions.shellArgs = [mongoShellOptions.connectionString];
          } else if (mongoShellOptions.connectionInfo !== undefined) {
            terminalOptions.shellArgs = ["--host", mongoShellOptions.connectionInfo.hostname];
            if (mongoShellOptions.connectionInfo.port) {
              terminalOptions.shellArgs.push("--port", mongoShellOptions.connectionInfo.port);
            }

            if (mongoShellOptions.connectionInfo.username) {
              terminalOptions.shellArgs.push("--username", mongoShellOptions.connectionInfo.username);
            }

            if (mongoShellOptions.connectionInfo.password) {
              terminalOptions.shellArgs.push("--password", mongoShellOptions.connectionInfo.password);
            }
          }

          if (mongoShellOptions.isCosmosDB && terminalOptions.shellArgs !== undefined) {
            terminalOptions.shellArgs.push("--tls", "--tlsAllowInvalidCertificates");
          }
        }

        const terminal = vscode.window.createTerminal(terminalOptions);
        context.subscriptions.push(terminal);
        vscode.window.onDidCloseTerminal((t: vscode.Terminal) => {
          if (t === terminal && t.exitStatus !== undefined && mongoShellInfo) {
            terminalMap.delete(mongoShellInfo.serverName);
          }
        });

        if (mongoShellInfo.databaseName !== undefined) {
          terminal.sendText(`use ${mongoShellInfo.databaseName}\n`);
        }
        terminal.show();

        if (!isTerminalOpen) {
          // Wait for it to settle, then make terminal bigger on first mongoshell
          // TODO: Consider maximize? "workbench.action.toggleMaximizedPanel"
          setTimeout(() => {
            vscode.commands.executeCommand("workbench.action.terminal.resizePaneUp");
            vscode.commands.executeCommand("workbench.action.terminal.resizePaneUp");
          }, 1000);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.importDocuments",
      async (
        objectExplorerContext: azdata.ObjectExplorerContext,
        connectionNodeInfo: IConnectionNodeInfo,
        databaseName?: string,
        containerName?: string // Collection name for mongo
      ) => {
        if (objectExplorerContext) {
          // Called from tree item context menu
          if (!objectExplorerContext.connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          if (!objectExplorerContext.nodeInfo) {
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return Promise.reject();
          }

          const connectionProfile = objectExplorerContext.connectionProfile!;
          connectionNodeInfo = {
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: objectExplorerContext.nodeInfo?.nodePath,
          };
        }

        if (!connectionNodeInfo) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          connectionNodeInfo = {
            connectionId: connectionProfile.connectionId,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: createNodePath(connectionProfile.serverName),
          };
        }

        const nodeInfo = getNodeInfo(connectionNodeInfo.nodePath!);
        databaseName = databaseName ?? nodeInfo?.databaseName;
        containerName = containerName ?? nodeInfo?.containerName;

        if (databaseName === undefined) {
          // TODO auto-connect if not connected
          const databases = await appContext.mongoService.listDatabases(connectionNodeInfo.server);
          const databaseNamePick = await vscode.window.showQuickPick(
            databases.map((db) => db.name),
            {
              placeHolder: localize("selectDatabase", "Select database"),
            }
          );

          if (databaseNamePick === undefined) {
            vscode.window.showErrorMessage(localize("missingDatabaseOrCollection", "Missing database"));
            return Promise.reject();
          } else {
            databaseName = databaseNamePick;
          }
        }

        if (containerName === undefined) {
          let items;
          if (objectExplorerContext.connectionProfile?.providerName === MongoProviderId) {
            const collections = await appContext.mongoService.listCollections(connectionNodeInfo.server, databaseName);
            (items = collections.map((collection) => collection.collectionName)),
              {
                placeHolder: localize("selectCollection", "Select collection"),
              };
          } else if (objectExplorerContext.connectionProfile?.providerName === NoSqlProviderId) {
            const containers = await appContext.cosmosDbNoSqlService.listContainers(
              connectionNodeInfo.server,
              databaseName
            );
            (items = containers.map((container) => container.id)),
              {
                placeHolder: localize("selectContainer", "Select container"),
              };
          } else {
            return Promise.reject();
          }

          const containerNamePick = await vscode.window.showQuickPick(items);

          if (containerNamePick === undefined) {
            vscode.window.showErrorMessage(localize("missingChoice", "Missing choice"));
            return Promise.reject();
          } else {
            containerName = containerNamePick;
          }
        }

        const fileUri = await vscode.window.showOpenDialog({
          filters: {
            JSON: ["json"],
          },
          openLabel: localize("import", "Import"),
          title: localize("selectFileToImport", "Select JSON file to import"),
        });

        if (!fileUri || fileUri.length === 0) {
          return Promise.reject();
        }

        const filePath = fileUri[0].fsPath;

        // Check if file is too large
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_IMPORT_FILE_SIZE_BYTES) {
          vscode.window.showErrorMessage(
            localize(
              "fileTooLargeToImport",
              "File is too large to import. Maximum file size is {0} MB",
              MAX_IMPORT_FILE_SIZE_BYTES / 1024 / 1024
            )
          );
          return Promise.reject();
        }

        fs.readFile(filePath, "utf8", async (error, rawData) => {
          if (error) {
            vscode.window.showErrorMessage(
              localize("errorReadingDataFileToImport", "Error reading data file to import: {0}", error.message)
            );
            return;
          }

          try {
            const data = JSON.parse(rawData);
            let _count, _elapsedTimeMS;
            await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                cancellable: true,
              },
              async (progress, token) => {
                progress.report({
                  message: localize("importingDocuments", "Importing documents..."),
                });
                try {
                  if (objectExplorerContext?.connectionProfile?.providerName === MongoProviderId) {
                    const { count, elapsedTimeMS } = await appContext.mongoService.insertDocuments(
                      connectionNodeInfo.server,
                      databaseName!,
                      containerName!,
                      data as unknown[],
                      () => token.isCancellationRequested,
                      (increment) => progress.report({ increment })
                    );
                    _count = count;
                    _elapsedTimeMS = elapsedTimeMS;
                  } else if (objectExplorerContext?.connectionProfile?.providerName === NoSqlProviderId) {
                    const { count, elapsedTimeMS } = await appContext.cosmosDbNoSqlService.insertDocuments(
                      connectionNodeInfo.server,
                      databaseName!,
                      containerName!,
                      data as unknown[],
                      () => token.isCancellationRequested,
                      (increment) => progress.report({ increment })
                    );
                    _count = count;
                    _elapsedTimeMS = elapsedTimeMS;
                  } else {
                    // Provider not supported
                    Promise.reject();
                    return;
                  }
                } catch (e: any) {
                  vscode.window.showErrorMessage(e.message);
                  Promise.reject();
                  return;
                }
              }
            );
            vscode.window.showInformationMessage(
              localize(
                "successInsertDoc",
                `Successfully inserted {0} documents (took ${Math.floor((_elapsedTimeMS ?? 0) / 1000)}s)`,
                _count
              )
            );
          } catch (e) {
            vscode.window.showErrorMessage(`${localize("errorImportingData", "Error importing data")}: ${e}`);
          }
        });
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.exportContainer",
      async (
        objectExplorerContext: azdata.ObjectExplorerContext,
        connectionNodeInfo: IConnectionNodeInfo,
        databaseName?: string,
        containerName?: string // collection name for mongo
      ) => {
        if (objectExplorerContext) {
          // Called from tree item context menu
          if (!objectExplorerContext.connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          if (!objectExplorerContext.nodeInfo) {
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return Promise.reject();
          }

          const connectionProfile = objectExplorerContext.connectionProfile!;
          connectionNodeInfo = {
            connectionId: connectionProfile.id,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: objectExplorerContext.nodeInfo?.nodePath,
          };
        }

        if (!connectionNodeInfo) {
          const connectionProfile = await askUserForConnectionProfile();
          if (!connectionProfile) {
            vscode.window.showErrorMessage(localize("missingConnectionProfile", "Missing ConnectionProfile"));
            return Promise.reject();
          }

          connectionNodeInfo = {
            connectionId: connectionProfile.connectionId,
            ...convertToConnectionOptions(connectionProfile),
            nodePath: createNodePath(connectionProfile.serverName),
          };
        }

        let backendService: AbstractBackendService;
        if (objectExplorerContext.connectionProfile?.providerName === MongoProviderId) {
          backendService = appContext.mongoService;
        } else if (objectExplorerContext.connectionProfile?.providerName === NoSqlProviderId) {
          backendService = appContext.cosmosDbNoSqlService;
        } else {
          // Provider not supported
          Promise.reject("Provider not supported");
          return;
        }

        const nodeInfo = getNodeInfo(connectionNodeInfo.nodePath!);
        databaseName = databaseName ?? nodeInfo?.databaseName;
        containerName = containerName ?? nodeInfo?.containerName;

        if (databaseName === undefined) {
          // TODO auto-connect if not connected
          const databases = await backendService.listDatabases(connectionNodeInfo.server);
          const databaseNamePick = await vscode.window.showQuickPick(
            databases.map((db) => db.name),
            {
              placeHolder: localize("selectDatabase", "Select database"),
            }
          );

          if (databaseNamePick === undefined) {
            vscode.window.showErrorMessage(localize("missingDatabaseOrCollection", "Missing database"));
            return Promise.reject();
          } else {
            databaseName = databaseNamePick;
          }
        }

        if (containerName === undefined) {
          let choices, missingCollectionError;
          if (objectExplorerContext.connectionProfile?.providerName === MongoProviderId) {
            const collections = await appContext.mongoService.listCollections(connectionNodeInfo.server, databaseName);
            (choices = collections.map((collection) => collection.collectionName)),
              {
                placeHolder: localize("selectCollection", "Select collection"),
              };
            missingCollectionError = localize("missingCollection", "Missing collection");
          } else if (objectExplorerContext.connectionProfile?.providerName === NoSqlProviderId) {
            const containers = await appContext.cosmosDbNoSqlService.listContainers(
              connectionNodeInfo.server,
              databaseName
            );
            (choices = containers.map((container) => container.id)),
              {
                placeHolder: localize("selectContainer", "Select container"),
              };
            missingCollectionError = localize("missingContainer", "Missing container");
          } else {
            // Provider not supported
            Promise.reject("Provider not supported");
            return;
          }

          const containerNamePick = await vscode.window.showQuickPick(choices);

          if (containerNamePick === undefined) {
            vscode.window.showErrorMessage(missingCollectionError);
            return Promise.reject();
          } else {
            containerName = containerNamePick;
          }
        }

        const fileUri = await vscode.window.showSaveDialog({
          filters: {
            JSON: ["json"],
          },
          saveLabel: localize("export", "Export"),
          title: localize("saveToFile", "Save to file"),
        });

        if (!fileUri) {
          return Promise.reject();
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              message: localize("exportingDocuments", "Exporting documents..."),
            });
            showStatusBarItem(localize("readingDocuments", "Reading documents..."));
            const documents = await backendService.getDocuments(
              connectionNodeInfo.server,
              databaseName!,
              containerName!
            );
            const documentsStr = JSON.stringify(documents, null, 0);

            showStatusBarItem(localize("savingDocumentsToFile", "Saving documents to file..."));
            fs.writeFile(fileUri.fsPath, documentsStr, (error) => {
              if (error) {
                vscode.window.showErrorMessage(
                  localize("errorWritingToFile", "Error writing data to file: {0}", error.message)
                );
                return;
              }
            });
            hideStatusBarItem();
            vscode.window.showInformationMessage(
              localize(
                "successfullyExportedDocuments",
                "Successfully exported {0} documents to {1}",
                documents.length,
                fileUri.fsPath
              )
            );
          }
        );
      }
    )
  );

  context.subscriptions.push(vscode.window.registerUriHandler(new UriHandler()));

  // create telemetry reporter on extension activation
  const packageInfo = getPackageInfo();
  const reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

  // Instantiate client
  appContext = new AppContext(reporter);
  createStatusBarItem();

  const mongoConnectionProvider = new ConnectionProvider(appContext.mongoService, MongoProviderId);
  const noSqlConnectionProvider = new ConnectionProvider(appContext.cosmosDbNoSqlService, NoSqlProviderId);
  const mongoIconProvider = new MongoIconProvider();
  const noSqlIconProvider = new NoSqlIconProvider();
  const mongoObjectExplorer = new MongoObjectExplorerProvider(context, appContext.reporter, appContext.mongoService);
  const noSqlObjectExplorer = new NoSqlObjectExplorerProvider(
    context,
    appContext.reporter,
    appContext.cosmosDbNoSqlService
  );
  const cosmosDbNoSqlFileSystemProvider = new CosmosDbNoSqlFileSystemProvider(appContext.cosmosDbNoSqlService);
  const cosmosDbMongoFileSystemProvider = new CosmosDbMongoFileSystemProvider(appContext.mongoService);

  azdata.dataprotocol.registerConnectionProvider(mongoConnectionProvider);
  azdata.dataprotocol.registerConnectionProvider(noSqlConnectionProvider);
  azdata.dataprotocol.registerIconProvider(mongoIconProvider);
  azdata.dataprotocol.registerIconProvider(noSqlIconProvider);
  azdata.dataprotocol.registerObjectExplorerProvider(mongoObjectExplorer);
  azdata.dataprotocol.registerObjectExplorerProvider(noSqlObjectExplorer);

  registerHomeDashboardTabs(context, appContext);

  // ensure it gets property disposed
  context.subscriptions.push(reporter);
  context.subscriptions.push(appContext);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(
      CosmosDbNoSqlFileSystemProvider.SCHEME,
      cosmosDbNoSqlFileSystemProvider,
      { isCaseSensitive: true }
    )
  );
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(
      CosmosDbMongoFileSystemProvider.SCHEME,
      cosmosDbMongoFileSystemProvider,
      { isCaseSensitive: true }
    )
  );
}

// export let objectExplorer:azdata.ObjectExplorerProvider | undefined; // TODO should we inject this instead?

// this method is called when your extension is deactivated
export function deactivate() {}
