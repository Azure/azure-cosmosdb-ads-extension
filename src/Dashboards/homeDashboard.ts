/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import { AppContext } from "../appContext";
import { NativeMongoHomeDashboard } from "./NativeMongoHomeDashboard";
import { isAzureConnection } from "../Services/ServiceUtil";
import { ArmServiceMongo } from "../Services/ArmServiceMongo";
import { ArmServiceNoSql } from "../Services/ArmServiceNoSql";
import { CosmosDbMongoHomeDashboard } from "./CosmosDbMongoHomeDashboard";
import { CosmosDbNoSqlHomeDashboard } from "./CosmosDbNoSqlHomeDashboard";

const dashboards = [];

export const registerMongoHomeDashboardTabs = (context: vscode.ExtensionContext, appContext: AppContext): void => {
  const cosmosDbMongoHomeDashboard = new CosmosDbMongoHomeDashboard(appContext.reporter, new ArmServiceMongo());
  const cosmosDbNoSqlHomeDashboard = new CosmosDbNoSqlHomeDashboard(appContext.reporter, new ArmServiceNoSql());
  const nativeMongoDashboard = new NativeMongoHomeDashboard(appContext.reporter, appContext.mongoService);
  dashboards.push(cosmosDbMongoHomeDashboard);
  dashboards.push(cosmosDbNoSqlHomeDashboard);
  dashboards.push(nativeMongoDashboard);

  azdata.ui.registerModelViewProvider("mongo-account-home", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? cosmosDbMongoHomeDashboard.buildModel(view, context)
        : nativeMongoDashboard.buildModel(view, context)
    );
  });

  azdata.ui.registerModelViewProvider("mongo-databases.tab", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? await cosmosDbMongoHomeDashboard.buildDatabasesArea(view, context)
        : await nativeMongoDashboard.buildDatabasesArea(view, context)
    );
  });

  azdata.ui.registerModelViewProvider("nosql-account-home", async (view) => {
    await view.initializeModel(cosmosDbNoSqlHomeDashboard.buildModel(view, context));
  });

  azdata.ui.registerModelViewProvider("nosql-databases.tab", async (view) => {
    await view.initializeModel(await cosmosDbNoSqlHomeDashboard.buildDatabasesArea(view, context));
  });
};
