/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import { AppContext } from "../appContext";
import { CosmosDbMongoHomeDashboardMongo } from "./cosmosDbMongoDashboard";
import { NativeMongoHomeDashboardMongo } from "./nativeMongoDashboard";
import { isAzureConnection } from "../Services/ServiceUtil";

const dashboards = [];

export const registerMongoHomeDashboardTabs = (context: vscode.ExtensionContext, appContext: AppContext): void => {
  const cosmosDbMongoDashboard = new CosmosDbMongoHomeDashboardMongo(appContext);
  const nativeMongoDashboard = new NativeMongoHomeDashboardMongo(appContext);
  dashboards.push(cosmosDbMongoDashboard);
  dashboards.push(nativeMongoDashboard);

  azdata.ui.registerModelViewProvider("mongo-account-home", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? cosmosDbMongoDashboard.buildModel(view, context)
        : nativeMongoDashboard.buildModel(view, context)
    );
  });

  azdata.ui.registerModelViewProvider("mongo-databases.tab", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? await cosmosDbMongoDashboard.buildDatabasesArea(view, context)
        : await nativeMongoDashboard.buildDatabasesArea(view, context)
    );
  });
};
