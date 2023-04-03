/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import { ICellActionEventArgs } from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { COSMOSDB_DOC_URL, Telemetry } from "../constant";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { convertToConnectionOptions, IDatabaseInfo } from "../models";
import { AbstractHomeDashboard } from "./AbstractHomeDashboard";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { MongoService } from "../Services/MongoService";
import { buildHeroCard } from "../util";

const localize = nls.loadMessageBundle();

export class NativeMongoHomeDashboard extends AbstractHomeDashboard {
  constructor(reporter: TelemetryReporter, private mongoService: MongoService) {
    super(reporter);
  }

  protected buildToolbar(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.ToolbarContainer {
    const buttons: (azdata.ButtonProperties & { onDidClick: () => void })[] = [
      {
        label: localize("newDatabase", "New Database"),
        iconPath: {
          light: context.asAbsolutePath("resources/light/add-database.svg"),
          dark: context.asAbsolutePath("resources/dark/add-database-inverse.svg"),
        },
        onDidClick: () => {
          const param: IConnectionNodeInfo = {
            connectionId: view.connection.connectionId,
            ...convertToConnectionOptions(view.connection),
          };
          vscode.commands
            .executeCommand("cosmosdb-ads-extension.createMongoDatabase", undefined, param)
            .then(() => this.refreshDatabases && this.refreshDatabases());
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.toolbarNewDatabase
          );
        },
      },
      {
        label: localize("openMongoShell", "Open Mongo Shell"),
        iconPath: {
          light: context.asAbsolutePath("resources/light/mongo-shell.svg"),
          dark: context.asAbsolutePath("resources/dark/mongo-shell-inverse.svg"),
        },
        onDidClick: () => {
          const connectionOptions = convertToConnectionOptions(view.connection);
          vscode.commands.executeCommand("cosmosdb-ads-extension.openMongoShell", undefined, {
            ...connectionOptions,
            databaseName: undefined,
            serverName: connectionOptions.server,
          });
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.toolbarOpenMongoShell
          );
        },
      },
      {
        label: localize("refresh", "Refresh"),
        iconPath: {
          light: context.asAbsolutePath("resources/light/refresh.svg"),
          dark: context.asAbsolutePath("resources/dark/refresh-inverse.svg"),
        },
        onDidClick: () => {
          this.refreshProperties && this.refreshProperties();
          this.refreshDatabases && this.refreshDatabases();
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.toolbarRefresh
          );
        },
      },
      {
        label: localize("learnMore", "Learn more"),
        iconPath: {
          light: context.asAbsolutePath("resources/light/learn-more.svg"),
          dark: context.asAbsolutePath("resources/dark/learn-more-inverse.svg"),
        },
        onDidClick: () => {
          vscode.env.openExternal(vscode.Uri.parse(COSMOSDB_DOC_URL));
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.toolbarLearnMore
          );
        },
      },
    ];
    const navElements: azdata.ButtonComponent[] = buttons.map((b) => {
      const component = view.modelBuilder.button().withProps(b).component();
      component.onDidClick(b.onDidClick);
      return component;
    });
    return view.modelBuilder
      .toolbarContainer()
      .withItems(navElements)
      .withLayout({ orientation: azdata.Orientation.Horizontal })
      .component();
  }

  protected createGettingStartedDefaultButtons(
    view: azdata.ModelView,
    context: vscode.ExtensionContext
  ): azdata.ButtonComponent[] {
    return [
      buildHeroCard(
        view,
        context.asAbsolutePath("resources/fluent/new-database.svg"),
        localize("newDatabase", "New Database"),
        localize("newDtabaseDescription", "Create database to store you data"),
        () => {
          const param: IConnectionNodeInfo = {
            connectionId: view.connection.connectionId,
            ...convertToConnectionOptions(view.connection),
          };
          vscode.commands
            .executeCommand("cosmosdb-ads-extension.createMongoDatabase", undefined, param)
            .then(() => this.refreshDatabases && this.refreshDatabases());
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.gettingStartedNewDatabase
          );
        }
      ),
      buildHeroCard(
        view,
        context.asAbsolutePath("resources/fluent/mongo-shell.svg"),
        localize("openMongoShell", "Query Data with Mongo Shell"),
        localize("mongoShellDescription", "Interact with data using Mongo shell"),
        () => {
          vscode.commands.executeCommand("cosmosdb-ads-extension.openMongoShell", {
            connectionProfile: view.connection,
          });
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.gettingStartedOpenMongoShell
          );
        }
      ),
      buildHeroCard(
        view,
        context.asAbsolutePath("resources/fluent/documentation.svg"),
        localize("documentation", "Documentation"),
        localize("documentation", "Find quickstarts, how-to guides, and references."),
        () => {
          vscode.env.openExternal(vscode.Uri.parse(COSMOSDB_DOC_URL));
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.gettingStartedDocumentation
          );
        }
      ),
    ];
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
      this.mongoService.listDatabases(server).then(async (dbs) => {
        databases = dbs;

        const databasesInfo: { name: string; nbCollections: number; sizeOnDisk: number | undefined }[] = [];
        for (const db of dbs) {
          const name = db.name;
          if (name !== undefined) {
            const nbCollections = (await this.mongoService.listCollections(server, name)).length;
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
          "cosmosdb-ads-extension.openMongoDatabaseDashboard",
          undefined,
          databaseDashboardInfo
        );
        this.reporter.sendActionEvent(
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
