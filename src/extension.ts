"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";

// The module 'azdata' contains the Azure Data Studio extensibility API
// This is a complementary set of APIs that add SQL / Data-specific functionality to the app
// Import the module and reference it with the alias azdata in your code below

import * as azdata from "azdata";
// import { MongoObjectExplorerNodeProvider } from './objectExplorerNodeProvider';
import { ConnectionProvider } from "./Providers/connectionProvider";
import { IconProvider } from "./Providers/iconProvider";
import { createNodePath, getMongoInfo, ObjectExplorerProvider } from "./Providers/objectExplorerNodeProvider";
import { AppContext } from "./appContext";
import * as databaseDashboard from "./Dashboards/databaseDashboard";
import { registerHomeDashboardTabs } from "./Dashboards/homeDashboard";
import { UriHandler } from "./protocol/UriHandler";

import * as path from "path";
import ViewLoader from "./ViewLoader";
import { downloadMongoShell } from "./MongoShell/MongoShellUtil";

export interface HasConnectionProfile {
  connectionProfile: azdata.IConnectionProfile;
}

/**
 * Check if this context is a node tree item
 * @param context
 * @returns
 */
const isNodeTreeItem = (context: azdata.ObjectExplorerContext) => !!context.nodeInfo;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "cosmosdb-ads-extension" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.createMongoDatabase",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        console.log(objectExplorerContext);
        if (!objectExplorerContext.connectionProfile) {
          vscode.window.showErrorMessage("Missing connectionProfile");
          return;
        }

        try {
          // Creating a database requires creating a collection inside
          const newDatabase = await appContext.createMongoCollection(objectExplorerContext.connectionProfile);
          if (newDatabase && isNodeTreeItem(objectExplorerContext)) {
            vscode.window.showInformationMessage(`Successfully created: ${newDatabase}`);
            if (isNodeTreeItem(objectExplorerContext)) {
              objectExplorer.updateNode(objectExplorerContext);
            }
          }
        } catch (e) {
          vscode.window.showErrorMessage(`Failed to create mongo database: ${e}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.createMongoCollection",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        console.log("createMongoCollection");
        if (!objectExplorerContext.connectionProfile) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing connectionProfile");
          return;
        }
        const { serverName } = objectExplorerContext.connectionProfile;

        // TODO FIX THIS
        if (!objectExplorerContext.nodeInfo) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing nodeInfo");
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const mongoInfo = getMongoInfo(nodePath);

        try {
          const newCollection = await appContext.createMongoCollection(
            objectExplorerContext.connectionProfile,
            mongoInfo.databaseName
          );
          if (newCollection) {
            vscode.window.showInformationMessage(`Successfully created: ${newCollection.collectionName}`);
            if (isNodeTreeItem(objectExplorerContext)) {
              objectExplorer.updateNode(objectExplorerContext);
            }
          }
        } catch (e) {
          vscode.window.showErrorMessage(`Failed to create mongo collection: ${e}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.deleteMongoDatabase",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        console.log(objectExplorerContext);
        if (!objectExplorerContext.connectionProfile) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing connectionProfile");
          return;
        }
        const { serverName } = objectExplorerContext.connectionProfile;

        // TODO FIX THIS
        if (!objectExplorerContext.nodeInfo) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing nodeInfo");
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const mongoInfo = getMongoInfo(nodePath);

        const response = await vscode.window.showInformationMessage(
          `Are you sure you want to remove the database: ${mongoInfo.databaseName}?`,
          ...["Yes", "No"]
        );
        if (response !== "Yes") {
          return;
        }

        if (await appContext.removeDatabase(serverName, mongoInfo.databaseName!)) {
          // update parent node
          const parentNode = { ...objectExplorerContext, isConnectionNode: true };
          await objectExplorer.updateNode(parentNode);
          vscode.window.showInformationMessage(`Database ${mongoInfo.databaseName} successfully deleted`);
        } else {
          vscode.window.showErrorMessage(`Failed to delete database ${mongoInfo.databaseName}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.deleteMongoCollection",
      async (objectExplorerContext: azdata.ObjectExplorerContext) => {
        console.log(objectExplorerContext);
        if (!objectExplorerContext.connectionProfile) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing connectionProfile");
          return;
        }
        const { id: connectionId, serverName } = objectExplorerContext.connectionProfile;

        // TODO FIX THIS
        if (!objectExplorerContext.nodeInfo) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing nodeInfo");
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const mongoInfo = getMongoInfo(nodePath);

        const response = await vscode.window.showInformationMessage(
          `Are you sure you want to remove the collection: ${mongoInfo.collectionName}?`,
          ...["Yes", "No"]
        );
        if (response !== "Yes") {
          return;
        }

        if (await appContext.removeCollection(serverName, mongoInfo.databaseName!, mongoInfo.collectionName!)) {
          // Find parent node to update
          const { serverName, databaseName } = getMongoInfo(objectExplorerContext.nodeInfo.nodePath);
          const newNodePath = createNodePath(serverName, databaseName);
          const parentNode = {
            ...objectExplorerContext,
            nodeInfo: { ...objectExplorerContext.nodeInfo, nodePath: newNodePath },
          };
          await objectExplorer.updateNode(parentNode);
          vscode.window.showInformationMessage(`Collection ${mongoInfo.collectionName} successfully deleted`);
        } else {
          vscode.window.showErrorMessage(`Failed to delete collection ${mongoInfo.collectionName}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openDatabaseDashboard",
      (azureAccountId: string, databaseName: string) => {
        // TODO ask for database if databaseName not defined
        databaseDashboard.openDatabaseDashboard(azureAccountId, databaseName, context);
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
      (azureAccountId: string, databaseName: string, collectionName: string) => {
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

        const view = new ViewLoader(context.extensionPath);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cosmosdb-ads-extension.openMongoShell",
      async (hasConnectionProfile?: HasConnectionProfile) => {
        console.log("Downloading mongoshell");

        // Download mongosh
        const executablePath = await downloadMongoShell(context.extensionPath);

        if (!executablePath) {
          vscode.window.showErrorMessage("Unable to download mongo shell");
          return;
        }
        const mongoShellOptions = await appContext.getMongoShellOptions(hasConnectionProfile?.connectionProfile);

        const serverName = hasConnectionProfile?.connectionProfile?.options["server"];
        const terminalOptions: vscode.TerminalOptions = {
          name: `Mongo Shell: ${serverName}`,
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

        // If account is known, skip the first prompt that asks for connection string
        if (mongoShellOptions?.connectionInfo) {
          terminal.sendText("\n");
        }
        terminal.show();
      }
    )
  );

  context.subscriptions.push(vscode.window.registerUriHandler(new UriHandler()));

  // Instantiate client
  const appContext = new AppContext();

  const connectionProvider = new ConnectionProvider(appContext);
  const iconProvider = new IconProvider();
  const objectExplorer = new ObjectExplorerProvider(context, appContext);
  azdata.dataprotocol.registerConnectionProvider(connectionProvider);
  azdata.dataprotocol.registerIconProvider(iconProvider);
  azdata.dataprotocol.registerObjectExplorerProvider(objectExplorer);

  registerHomeDashboardTabs(context, appContext);
}

// this method is called when your extension is deactivated
export function deactivate() {}
