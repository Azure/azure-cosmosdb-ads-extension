/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import { ICellActionEventArgs } from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { Telemetry } from "../constant";
import { IDatabaseDashboardInfo } from "../extension";
import { convertToConnectionOptions, IDatabaseInfo } from "../models";
import { AbstractHomeDashboardMongo } from "./AbstractHomeDashboardMongo";
import { AppContext } from "../appContext";

const localize = nls.loadMessageBundle();

export class NativeMongoHomeDashboardMongo extends AbstractHomeDashboardMongo {
  constructor(appContext: AppContext) {
    super(appContext);
  }

  public buildModel(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.FlexContainer {
    const viewItems: azdata.Component[] = [this.buildToolbar(view, context)];
    viewItems.push(this.buildGettingStarted(view, context));

    return view.modelBuilder.flexContainer().withItems(viewItems).withLayout({ flexFlow: "column" }).component();
  }

  private buildGettingStarted(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component {
    const heroCards: azdata.ButtonComponent[] = this.createGettingStartedDefaultButtons(view, context);

    const heroCardsContainer = view.modelBuilder
      .flexContainer()
      .withItems(heroCards, { flex: "0 0 auto" })
      .withLayout({ flexFlow: "row", flexWrap: "wrap" })
      .withProps({ CSSStyles: { width: "100%" } })
      .component();

    return view.modelBuilder
      .flexContainer()
      .withItems([
        view.modelBuilder
          .text()
          .withProps({
            value: localize("gettingStarted", "Getting started"),
            CSSStyles: { "font-size": "20px", "font-weight": "600" },
          })
          .component(),
        view.modelBuilder
          .text()
          .withProps({
            value: localize(
              "gettingStartedDescription",
              "Getting started with creating a new database, using mongo shell, viewing documentation, and managing via portal"
            ),
          })
          .component(),
        heroCardsContainer,
      ])
      .withLayout({ flexFlow: "column" })
      .withProps({
        CSSStyles: {
          padding: "10px",
        },
      })
      .component();
  }

  public async buildDatabasesArea(view: azdata.ModelView, context: vscode.ExtensionContext): Promise<azdata.Component> {
    const server = view.connection.options["server"];
    let databases: IDatabaseInfo[];

    this.refreshDatabases = () => {
      this.appContext.nativeMongoService.listDatabases(server).then(async (dbs) => {
        databases = dbs;

        const databasesInfo: { name: string; nbCollections: number; sizeOnDisk: number | undefined }[] = [];
        for (const db of dbs) {
          const name = db.name;
          if (name !== undefined) {
            const nbCollections = (await this.appContext.nativeMongoService.listCollections(server, name)).length;
            databasesInfo.push({ name, nbCollections, sizeOnDisk: db.sizeOnDisk });
          }
        }
        tableComponent.data = databasesInfo.map((db) => [
          <azdata.HyperlinkColumnCellValue>{
            title: db.name,
            icon: context.asAbsolutePath("resources/fluent/database.svg"),
          },
          db.sizeOnDisk,
          db.nbCollections,
        ]);

        tableLoadingComponent.loading = false;
      });
    };
    this.refreshDatabases();

    const tableComponent = view.modelBuilder
      .table()
      .withProps({
        columns: [
          <azdata.HyperlinkColumn>{
            value: localize("database", "Database"),
            type: azdata.ColumnType.hyperlink,
            name: "Database",
            width: 250,
          },
          {
            value: localize("sizeOnDisk", "Size On Disk"),
            type: azdata.ColumnType.text,
          },
          {
            value: localize("collections", "Collections"),
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
        if (!databases) {
          return;
        }

        const databaseDashboardInfo: IDatabaseDashboardInfo = {
          databaseName: databases[arg.row].name,
          connectionId: view.connection.connectionId,
          ...convertToConnectionOptions(view.connection),
        };
        vscode.commands.executeCommand(
          "cosmosdb-ads-extension.openDatabaseDashboard",
          undefined,
          databaseDashboardInfo
        );
        this.appContext.reporter.sendActionEvent(
          Telemetry.sources.homeDashboard,
          Telemetry.actions.click,
          Telemetry.targets.homeDashboard.databasesListNonAzureOpenDashboard
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
            value: localize("databaseOverview", "Database overview"),
            CSSStyles: { "font-size": "20px", "font-weight": "600" },
          })
          .component(),
        view.modelBuilder
          .text()
          .withProps({
            value: localize("clickOnDatabaseDescription", "Click on a database for more details"),
          })
          .component(),
        tableLoadingComponent,
      ])
      .withLayout({ flexFlow: "column" })
      .withProps({ CSSStyles: { padding: "10px" } })
      .component();
  }
}
