"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// The module 'azdata' contains the Azure Data Studio extensibility API
// This is a complementary set of APIs that add SQL / Data-specific functionality to the app
// Import the module and reference it with the alias azdata in your code below

import * as azdata from "azdata";
// import { MongoObjectExplorerNodeProvider } from './objectExplorerNodeProvider';
import { ConnectionProvider } from "./Providers/connectionProvider";
import { IconProvider } from "./Providers/iconProvider";
import { getMongoInfo, ObjectExplorerProvider } from "./Providers/objectExplorerNodeProvider";
import { AppContext } from "./appContext";
import * as dashboard from "./Dashboards/modelViewDashboard";
import { registerSqlServicesModelView } from "./Dashboards/modelViewDashboard";

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
      (objectExplorerContext: azdata.ObjectExplorerContext) => {
        console.log(objectExplorerContext);
        if (!objectExplorerContext.connectionProfile) {
          // TODO display error message
          return;
        }
        const { id: connectionId, serverName } = objectExplorerContext.connectionProfile;

        // Creating a database requires creating a collection inside
        appContext.createMongoCollection({ connectionId, serverName });
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
        const { id: connectionId, serverName } = objectExplorerContext.connectionProfile;

        // TODO FIX THIS
        if (!objectExplorerContext.nodeInfo) {
          // TODO handle error;
          vscode.window.showErrorMessage("Missing nodeInfo");
          return;
        }
        const { nodePath } = objectExplorerContext.nodeInfo;
        const mongoInfo = getMongoInfo(nodePath);
        await appContext.createMongoCollection({ connectionId, serverName }, mongoInfo.databaseName);

        // TODO: Refresh node
        setTimeout(
          () => objectExplorer.expandDatabase({ nodePath, sessionId: serverName }, mongoInfo.databaseName!, serverName),
          0
        );

        // // The code you place here will be executed every time your command is executed

        // // Display a message box to the user
        // azdata.connection.getCurrentConnection().then(connection => {
        //     let connectionId = connection ? connection.connectionId : 'No connection found!';
        //     vscode.window.showInformationMessage(connectionId);
        // }, error => {
        //      console.info(error);
        // });
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
          `Are you sure you want to remove the database: ${mongoInfo.databaseName}?`,
          ...["Yes", "No"]
        );
        if (response !== "Yes") {
          return;
        }

        if (await appContext.removeDatabase(serverName, mongoInfo.databaseName!)) {
          vscode.window.showInformationMessage(`Database ${mongoInfo.databaseName} successfully deleted`);
          // TODO: Update server node
        } else {
          vscode.window.showErrorMessage(`Failed to delete database ${mongoInfo.databaseName}`);
        }

        // // Display a message box to the user
        // azdata.connection.getCurrentConnection().then(connection => {
        //     let connectionId = connection ? connection.connectionId : 'No connection found!';
        //     vscode.window.showInformationMessage(connectionId);
        // }, error => {
        //      console.info(error);
        // });
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
          const sessionId = objectExplorerContext?.connectionProfile?.connectionName || "";
          // objectExplorer.refreshNode({
          //     nodePath: createNodePath(serverName, databaseName),
          //     sessionId: serverName
          // });

          setTimeout(() => {
            objectExplorer.expandDatabase({ nodePath, sessionId }, mongoInfo.databaseName!, serverName);
          }, 0);

          vscode.window.showInformationMessage(`Collection ${mongoInfo.collectionName} successfully deleted`);
        } else {
          vscode.window.showErrorMessage(`Failed to delete collection ${mongoInfo.collectionName}`);
        }

        // // Display a message box to the user
        // azdata.connection.getCurrentConnection().then(connection => {
        //     let connectionId = connection ? connection.connectionId : 'No connection found!';
        //     vscode.window.showInformationMessage(connectionId);
        // }, error => {
        //      console.info(error);
        // });
      }
    )
  );

  vscode.commands.registerCommand("cosmosdb-ads-extension.openModelViewDashboard", () => {
    dashboard.openModelViewDashboard(context);
  });

  // Instantiate client
  const appContext = new AppContext();

  const connectionProvider = new ConnectionProvider(appContext);
  const iconProvider = new IconProvider();
  const objectExplorer = new ObjectExplorerProvider(appContext);
  azdata.dataprotocol.registerConnectionProvider(connectionProvider);
  azdata.dataprotocol.registerIconProvider(iconProvider);
  azdata.dataprotocol.registerObjectExplorerProvider(objectExplorer);
  registerSqlServicesModelView();
}

// this method is called when your extension is deactivated
export function deactivate() {}
