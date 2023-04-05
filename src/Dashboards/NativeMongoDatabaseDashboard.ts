/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import { ICellActionEventArgs } from "azdata";
import { CollStats, Collection, Document } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { Telemetry } from "../constant";
import { IDatabaseDashboardInfo } from "../extension";
import { AbstractMongoDatabaseDashboard } from "./AbstractMongoDatabaseDashboard";

const localize = nls.loadMessageBundle();

export class NativeMongoDatabaseDashboard extends AbstractMongoDatabaseDashboard {
  constructor(providerId: string) {
    super(providerId);
  }

  protected async buildCollectionsArea(
    databaseName: string,
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): Promise<azdata.Component> {
    let collections: Collection<Document>[];

    this.refreshCollections = () => {
      appContext.mongoService
        .listCollections(databaseDashboardInfo.server, databaseName)
        .then(async (collectionsInfo) => {
          collections = collectionsInfo;
          const statsMap = new Map<string, CollStats>();
          // Retrieve all stats for each collection
          await Promise.all(
            collectionsInfo.map((collection) =>
              collection.stats().then((stats) => statsMap.set(collection.collectionName, stats))
            )
          );

          tableComponent.data = collectionsInfo.map((collection) => {
            const stats = statsMap.get(collection.collectionName);
            return [
              <azdata.HyperlinkColumnCellValue>{
                title: collection.collectionName,
                icon: context.asAbsolutePath("resources/fluent/collection.svg"),
              },
              stats?.storageSize,
              stats?.count,
            ];
          });

          tableLoadingComponent.loading = false;
        });
    };
    this.refreshCollections();

    const tableComponent = view.modelBuilder
      .table()
      .withProps({
        columns: [
          <azdata.HyperlinkColumn>{
            value: localize("collection", "Collection"),
            type: azdata.ColumnType.hyperlink,
            name: "Collection",
            width: 250,
          },
          {
            value: localize("dataUsage", "Storage Size (bytes)"),
            type: azdata.ColumnType.text,
          },
          {
            value: localize("documents", "Documents"),
            type: azdata.ColumnType.text,
          },
        ],
        data: [],
        height: 500,
        CSSStyles: {
          padding: "20px",
        },
      })
      .component();

    tableComponent.onCellAction &&
      tableComponent.onCellAction((arg: ICellActionEventArgs) => {
        vscode.commands.executeCommand("cosmosdb-ads-extension.openMongoShell", undefined, {
          ...databaseDashboardInfo,
          serverName: databaseDashboardInfo.server,
        });

        // TODO Replace previous code with this to enable query editor
        // vscode.commands.executeCommand(
        //   "cosmosdb-ads-extension.openMongoQuery",
        //   { ...databaseDashboardInfo },
        //   databaseDashboardInfo.databaseName,
        //   collections[arg.row].collectionName
        // );

        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.collectionsListNonAzureOpenDashboard
        );
      });

    const tableLoadingComponent = view.modelBuilder
      .loadingComponent()
      .withItem(tableComponent)
      .withProps({
        loading: true,
      })
      .component();

    return view.modelBuilder
      .flexContainer()
      .withItems([
        view.modelBuilder
          .text()
          .withProps({
            value: localize("collectionOverview", "Collection overview"),
            CSSStyles: { "font-size": "20px", "font-weight": "600" },
          })
          .component(),
        view.modelBuilder
          .text()
          .withProps({
            value: localize("collectionOverviewDescription", "Click on a collection to work with the data"),
          })
          .component(),
        tableLoadingComponent,
      ])
      .withLayout({ flexFlow: "column" })
      .withProps({ CSSStyles: { padding: "10px" } })
      .component();
  }
}
