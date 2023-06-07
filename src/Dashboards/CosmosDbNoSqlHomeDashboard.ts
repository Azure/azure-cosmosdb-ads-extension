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
import { buildHeroCard } from "../util";
import { CosmosDbNoSqlService } from "../Services/CosmosDbNoSqlService";

const localize = nls.loadMessageBundle();

// TODO see if we can merge with NativeMongoHomeDashboard which is almost identical
export class CosmosDbNoSqlHomeDashboard extends AbstractHomeDashboard {
  constructor(reporter: TelemetryReporter, private cosmosDbNoSqlService: CosmosDbNoSqlService) {
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
            .executeCommand("cosmosdb-ads-extension.createNoSqlDatabase", undefined, param)
            .then(() => this.refreshDatabases && this.refreshDatabases());
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.toolbarNewDatabase
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
            .executeCommand("cosmosdb-ads-extension.createNoSqlDatabase", undefined, param)
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
    this.createModelViewItems(view, context).forEach((p) => {
      viewItems.push(p);
    });
    return view.modelBuilder.flexContainer().withItems(viewItems).withLayout({ flexFlow: "column" }).component();
  }

  protected createModelViewItems(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component[] {
    return [this.buildGettingStarted(view, context)];
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
              "Getting started with creating a new database, viewing documentation"
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
      this.cosmosDbNoSqlService.listDatabases(server).then(async (dbs) => {
        databases = dbs;

        const databasesInfo: { name: string; nbContainers: number }[] = [];
        for (const db of dbs) {
          const name = db.name;
          if (name !== undefined) {
            const nbContainers = (await this.cosmosDbNoSqlService.listContainers(server, name)).length;
            databasesInfo.push({ name, nbContainers: nbContainers });
          }
        }
        tableComponent.data = databasesInfo.map((db) => [
          <azdata.HyperlinkColumnCellValue>{
            title: db.name,
            icon: context.asAbsolutePath("resources/fluent/database.svg"),
          },
          db.nbContainers,
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
            value: localize("containers", "Containers"),
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
          "cosmosdb-ads-extension.openNoSqlDatabaseDashboard",
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
