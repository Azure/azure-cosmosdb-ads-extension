/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import { AppContext } from "../appContext";
import { NativeMongoHomeDashboard } from "./NativeMongoHomeDashboard";
import { isAzureConnection } from "../Services/ServiceUtil";
import { AzureCosmosDbMongoHomeDashboard } from "./AzureCosmosDbMongoHomeDashboard";
import { AzureCosmosDbNoSqlHomeDashboard } from "./AzureCosmosDbNoSqlHomeDashboard";
import { CosmosDbMongoClusterHomeDashboard } from "./CosmosDbMongoClusterHomeDashboard";
import { CosmosDbNoSqlHomeDashboard } from "./CosmosDbNoSqlHomeDashboard";

export const registerHomeDashboardTabs = (context: vscode.ExtensionContext, appContext: AppContext): void => {
  const azureCosmosDbMongoHomeDashboard = new AzureCosmosDbMongoHomeDashboard(
    appContext.reporter,
    appContext.armServiceMongo
  );
  const azureCosmosDbNoSqlHomeDashboard = new AzureCosmosDbNoSqlHomeDashboard(
    appContext.reporter,
    appContext.armServiceNoSql
  );
  const cosmosDbMongoClusterHomeDashboard = new CosmosDbMongoClusterHomeDashboard(
    appContext.reporter,
    appContext.mongoService,
    appContext.armServiceMongo
  );
  const nativeMongoDashboard = new NativeMongoHomeDashboard(appContext.reporter, appContext.mongoService);
  const cosmosDbNoSqlHomeDashboard = new CosmosDbNoSqlHomeDashboard(
    appContext.reporter,
    appContext.cosmosDbNoSqlService
  );

  azdata.ui.registerModelViewProvider("mongo-account-home", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? view.connection.options["isServer"]
          ? cosmosDbMongoClusterHomeDashboard.buildModel(view, context)
          : azureCosmosDbMongoHomeDashboard.buildModel(view, context)
        : nativeMongoDashboard.buildModel(view, context)
    );
  });

  azdata.ui.registerModelViewProvider("mongo-databases.tab", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection) && !view.connection.options["isServer"]
        ? await azureCosmosDbMongoHomeDashboard.buildDatabasesArea(view, context)
        : await nativeMongoDashboard.buildDatabasesArea(view, context)
    );
  });

  azdata.ui.registerModelViewProvider("nosql-account-home", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? azureCosmosDbNoSqlHomeDashboard.buildModel(view, context)
        : cosmosDbNoSqlHomeDashboard.buildModel(view, context)
    );
  });

  azdata.ui.registerModelViewProvider("nosql-databases.tab", async (view) => {
    await view.initializeModel(
      isAzureConnection(view.connection)
        ? await azureCosmosDbNoSqlHomeDashboard.buildDatabasesArea(view, context)
        : await cosmosDbNoSqlHomeDashboard.buildDatabasesArea(view, context)
    );
  });
};
