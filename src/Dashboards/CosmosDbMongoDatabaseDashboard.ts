/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { Telemetry } from "../constant";
import { IDatabaseDashboardInfo } from "../extension";
import { ICosmosDbCollectionInfo } from "../models";
import { AbstractDatabaseDashboard } from "./AbstractDatabaseDashboard";
import {
  changeMongoDbCollectionThroughput,
  getAccountNameFromOptions,
  retrieveMongoDbCollectionsInfoFromArm,
} from "../Services/ArmService";

const localize = nls.loadMessageBundle();

export class CosmosDbMongoDatabaseDashboard extends AbstractDatabaseDashboard {
  protected async buildCollectionsArea(
    databaseName: string,
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): Promise<azdata.Component> {
    let collections: ICosmosDbCollectionInfo[];

    this.refreshCollections = () => {
      retrieveMongoDbCollectionsInfoFromArm(
        databaseDashboardInfo.azureAccount,
        databaseDashboardInfo.azureTenantId,
        databaseDashboardInfo.azureResourceId,
        getAccountNameFromOptions(databaseDashboardInfo),
        databaseName
      ).then((collectionsInfo) => {
        collections = collectionsInfo;
        tableComponent.data = collectionsInfo.map((collection) => [
          <azdata.HyperlinkColumnCellValue>{
            title: collection.name,
            icon: context.asAbsolutePath("resources/fluent/collection.svg"),
          },
          collection.usageSizeKB === undefined ? localize("unknown", "Unknown") : collection.usageSizeKB,
          collection.documentCount === undefined ? localize("unknown", "Unknown") : collection.documentCount,
          collection.shardKey === undefined ? "" : Object.keys(collection.shardKey)[0],
          <azdata.HyperlinkColumnCellValue>{
            title: collection.throughputSetting,
          },
        ]);

        tableLoadingComponent.loading = false;
      });
    };
    this.refreshCollections();

    const tableComponent = view.modelBuilder
      .table()
      .withProps({
        columns: [
          <azdata.HyperlinkColumn>{
            value: "collection",
            type: azdata.ColumnType.hyperlink,
            name: localize("collection", "Collection"),
            width: 250,
          },
          {
            value: localize("dataUsage", "Data Usage (KB)"),
            type: azdata.ColumnType.text,
          },
          {
            value: localize("documents", "Documents"),
            type: azdata.ColumnType.text,
          },
          {
            value: localize("shardKey", "Shard key"),
            type: azdata.ColumnType.text,
          },
          <azdata.HyperlinkColumn>{
            value: "throughput",
            type: azdata.ColumnType.hyperlink,
            name: localize("throughput", "Throughput"),
            width: 200,
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
      tableComponent.onCellAction(async (arg: any /* Bug with definition: ICellActionEventArgs */) => {
        if (arg.name === "collection") {
          vscode.commands.executeCommand(
            "cosmosdb-ads-extension.openQuery",
            { ...databaseDashboardInfo },
            databaseDashboardInfo.databaseName,
            collections[arg.row].name
          );

          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.collectionsListAzureOpenDashboard
          );
        } else if (arg.name === "throughput" && collections[arg.row].throughputSetting !== "") {
          try {
            const result = await changeMongoDbCollectionThroughput(
              databaseDashboardInfo.azureAccount,
              databaseDashboardInfo.azureTenantId,
              databaseDashboardInfo.azureResourceId,
              getAccountNameFromOptions(databaseDashboardInfo),
              databaseName,
              collections[arg.row]
            );
            if (result) {
              this.refreshCollections && this.refreshCollections();
            }
            appContext.reporter?.sendActionEvent(
              Telemetry.sources.databaseDashboard,
              Telemetry.actions.click,
              Telemetry.targets.databaseDashboard.collectionsListAzureChangeThroughput
            );
          } catch (e: any) {
            vscode.window.showErrorMessage(e?.message);
          }
        }
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
