/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import { AppContext, isAzureConnection } from "../appContext";
import { CosmosDbMongoDashboard } from "./cosmosDbMongoDashboard";
import { NativeMongoDashboard } from "./nativeMongoDashboard";

const dashboards = [];

export const registerMongoHomeDashboardTabs = (context: vscode.ExtensionContext, appContext: AppContext): void => {
  const cosmosDbMongoDashboard = new CosmosDbMongoDashboard();
  const nativeMongoDashboard = new NativeMongoDashboard();
  dashboards.push(cosmosDbMongoDashboard);
  dashboards.push(nativeMongoDashboard);

  azdata.ui.registerModelViewProvider("mongo-account-home", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? cosmosDbMongoDashboard.buildModel(view, context, appContext)
        : nativeMongoDashboard.buildModel(view, context, appContext)
    );
  });

  azdata.ui.registerModelViewProvider("mongo-databases.tab", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? await cosmosDbMongoDashboard.buildDatabasesArea(view, context, appContext)
        : await nativeMongoDashboard.buildDatabasesArea(view, context, appContext)
    );
  });
};
