"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as fs from "fs";
import * as path from "path";

// The module 'azdata' contains the Azure Data Studio extensibility API
// This is a complementary set of APIs that add SQL / Data-specific functionality to the app
// Import the module and reference it with the alias azdata in your code below

import * as azdata from "azdata";
import { ConnectionProvider } from "./Providers/connectionProvider";
import { IconProvider } from "./Providers/iconProvider";
import { createNodePath, getMongoInfo, ObjectExplorerProvider } from "./Providers/objectExplorerNodeProvider";
import {
  AppContext,
  askUserForConnectionProfile,
  createStatusBarItem,
  getNbServiceInfo,
  NotebookServiceInfo,
} from "./appContext";
import * as databaseDashboard from "./Dashboards/databaseDashboard";
import { registerHomeDashboardTabs } from "./Dashboards/homeDashboard";
import { UriHandler } from "./protocol/UriHandler";
import ViewLoader from "./ViewLoader";
import { downloadMongoShell } from "./MongoShell/MongoShellUtil";
import { convertToConnectionOptions, IConnectionOptions } from "./models";
import { Collection, Document } from "mongodb";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { getMongoShellConfig, getPackageInfo } from "./Dashboards/util";
import { CdbCollectionCreateInfo } from "./sampleData/DataSamplesUtil";
import { LOCAL_RESOURCES_DIR, SAMPLE_DATA_VERSION } from "./constant";

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

/**
 * Delete all files in this folderPath except exceptName
 * @param folderPath
 * @param exceptName
 */
const deleteAllFilesExcept = (folderPath: string, exceptName: string) => {
  fs.readdir(folderPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      return;
    } else {
      files
        .filter((dirent) => dirent.isDirectory() && dirent.name !== exceptName)
        .forEach((dirent) => {
          const dirToDeletePath = path.join(folderPath, dirent.name);
          fs.rmdir(
            dirToDeletePath,
            { recursive: true },
            (err) => err && console.error(`Unable to remove folder ${dirToDeletePath} ${err}`)
          );
        });
    }
  });
};

/**
 * Delete local resources if the version is not the correct one
 */
const cleanupLocalResources = (extensionPath: string): void => {
  // Delete legacy location
  let mongoShellPath = path.join(extensionPath, "mongoshellexecutable");
  fs.rmdir(
    mongoShellPath,
    { recursive: true },
    (err) => err && console.error(`Unable to remove folder ${mongoShellPath} ${err}`)
  );

  // Find and remove all subfolders that aren't the current version
  mongoShellPath = path.join(extensionPath, LOCAL_RESOURCES_DIR, "mongoshell");
  const currentMongoShellVersion = getMongoShellConfig().version;
  deleteAllFilesExcept(mongoShellPath, currentMongoShellVersion);
  deleteAllFilesExcept(path.join(extensionPath, LOCAL_RESOURCES_DIR, "sampledata"), SAMPLE_DATA_VERSION);
};

let appContext: AppContext;

export function activate(context: vscode.ExtensionContext) {
  cleanupLocalResources(context.extensionPath);

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
          const { databaseName } = await appContext.createMongoDatabase(connectionNodeInfo);
          if (databaseName) {
            vscode.window.showInformationMessage(
              localize("sucessfullyCreatedDatabase", "Successfully created database: {0}", databaseName)
            );
            objectExplorer.updateNode(connectionNodeInfo.connectionId, connectionNodeInfo.server);
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

        const { databaseName } = getMongoInfo(connectionNodeInfo.nodePath!);

        try {
          const createResult = await appContext.createMongoDatabaseAndCollection(
            connectionNodeInfo,
            databaseName,
            collectionName,
            cdbCreateInfo
          );
          if (createResult.collectionName) {
            vscode.window.showInformationMessage(
              localize("successCreateCollection", "Successfully created: {0}", createResult.collectionName)
            );
            objectExplorer.updateNode(connectionNodeInfo.connectionId, connectionNodeInfo.nodePath);
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
        const mongoInfo = getMongoInfo(nodePath);

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
          if (await appContext.removeDatabase(serverName, mongoInfo.databaseName!)) {
            // update parent node
            await objectExplorer.updateNode(
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
        const mongoInfo = getMongoInfo(nodePath);

        const response = await vscode.window.showInputBox({
          placeHolder: localize("removeCollectionConfirm", "Please enter the name of the collection to delete"),
        });

        if (response !== mongoInfo.collectionName) {
          vscode.window.showErrorMessage(
            localize(
              "incorrectDeleteCollection",
              "Incorrect name supplied to delete collection {0}",
              mongoInfo.collectionName
            )
          );
          return;
        }

        try {
          if (await appContext.removeCollection(serverName, mongoInfo.databaseName!, mongoInfo.collectionName!)) {
            // Find parent node to update
            const { serverName, databaseName } = getMongoInfo(objectExplorerContext.nodeInfo.nodePath);
            const newNodePath = createNodePath(serverName, databaseName);
            await objectExplorer.updateNode(objectExplorerContext.connectionProfile.id, newNodePath);
            vscode.window.showInformationMessage(
              localize("successDeleteCollection", "Successfully deleted collection {0}", mongoInfo.collectionName)
            );
          } else {
            vscode.window.showErrorMessage(
              localize("failDeleteCollection", "Failed to delete collection {0}", mongoInfo.collectionName)
            );
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `${localize("failDeleteCollection", "Failed to delete collection {0}:", mongoInfo.collectionName)}: ${e}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openDatabaseDashboard",
      (objectExplorerContext: azdata.ObjectExplorerContext, databaseDashboardInfo?: IDatabaseDashboardInfo) => {
        if (objectExplorerContext?.connectionProfile) {
          // Called from menu tree item context menu

          if (!objectExplorerContext.nodeInfo) {
            // TODO handle error;
            vscode.window.showErrorMessage(localize("missingNodeInfo", "Missing node information"));
            return;
          }

          const mongoInfo = getMongoInfo(objectExplorerContext.nodeInfo.nodePath);
          const connectionProfile = objectExplorerContext.connectionProfile;
          databaseDashboardInfo = {
            databaseName: mongoInfo.databaseName,
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

        databaseDashboard.openDatabaseDashboard(databaseDashboardInfo, appContext, context);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cosmosdb-ads-extension.openCollection", (collectionName: string) => {
      // TODO implement
      vscode.window.showInformationMessage(collectionName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openQuery",
      async (azureAccountId: string, databaseName: string, collectionName: string) => {
        // const panel = vscode.window.createWebviewPanel(
        //   "cosmosDbQuery", // Identifies the type of the webview. Used internally
        //   "Query", // Title of the panel displayed to the user
        //   vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        //   {
        //     enableScripts: true
        //     // Only allow the webview to access resources in our extension's media directory
        //     // localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "output"))],
        //   }
        // );

        // const filePath: vscode.Uri = vscode.Uri.file(path.join(context.extensionPath, "output", "wwwroot", "notebookClient", "dist", "index.html"));
        // try {
        //   panel.webview.html = fs.readFileSync(filePath.fsPath, "utf8");
        // 	console.log('READ');
        // } catch(e) {
        //   console.error(e);
        // }

        // Get path to resource on disk
        // const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, "output", "wwwroot", "notebookClient", "dist", "index2.html"));
        // // And get the special URI to use with the webview
        // const indexSrc = panel.webview.asWebviewUri(onDiskPath);
        // console.log(indexSrc);

        // panel.webview.html = getWebviewContent();

        try {
          const initMsg: NotebookServiceInfo = await getNbServiceInfo();
          const view = new ViewLoader(context.extensionPath, () => {
            view.sendInitializeMessage(initMsg);
          });
        } catch (e) {
          vscode.window.showErrorMessage(localize("failOpenNotebookClient", "Error opening notebook client"));
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openMongoShell",
      async (connectionOptions?: IConnectionOptions, databaseName?: string) => {
        const serverName = connectionOptions?.server;
        if (!serverName) {
          vscode.window.showErrorMessage(localize("noServerSpecified", "No server specified"));
          return;
        }

        const terminalName = `${serverName}${databaseName ? "/" + databaseName : ""}`;

        let counter = terminalMap.get(terminalName) ?? -1;
        const isTerminalOpen = terminalMap.size > 0;
        terminalMap.set(terminalName, ++counter);

        // Download mongosh
        const executablePath = await downloadMongoShell(context.extensionPath);

        if (!executablePath) {
          vscode.window.showErrorMessage(localize("failInstallMongoShell", "Unable to install mongo shell"));
          return;
        }
        const mongoShellOptions = await appContext.getMongoShellOptions(connectionOptions);

        const terminalOptions: vscode.TerminalOptions = {
          name: `Mongo Shell: ${terminalName}-${counter}`,
          shellPath: executablePath,
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

        vscode.window.onDidCloseTerminal((t) => {
          if (t === terminal && t.exitStatus !== undefined) {
            terminalMap.delete(serverName);
          }
        });

        if (databaseName !== undefined) {
          terminal.sendText(`use ${databaseName}\n`);
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

  context.subscriptions.push(vscode.window.registerUriHandler(new UriHandler()));

  // Instantiate client
  appContext = new AppContext();
  createStatusBarItem();

  const connectionProvider = new ConnectionProvider(appContext);
  const iconProvider = new IconProvider();
  const objectExplorer = new ObjectExplorerProvider(context, appContext);
  azdata.dataprotocol.registerConnectionProvider(connectionProvider);
  azdata.dataprotocol.registerIconProvider(iconProvider);
  azdata.dataprotocol.registerObjectExplorerProvider(objectExplorer);

  registerHomeDashboardTabs(context, appContext);

  // create telemetry reporter on extension activation
  const packageInfo = getPackageInfo();
  appContext.reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
  // ensure it gets property disposed
  context.subscriptions.push(appContext.reporter);
}

// export let objectExplorer:azdata.ObjectExplorerProvider | undefined; // TODO should we inject this instead?

// this method is called when your extension is deactivated
export function deactivate() {}
