/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { Telemetry } from "../constant";
import { IDatabaseDashboardInfo } from "../extension";
import { convertToConnectionOptions, ICosmosDbDatabaseInfo } from "../models";
import { buildHeroCard } from "../util";
import { AbstractHomeDashboard } from "./AbstractHomeDashboard";
import { AbstractArmService } from "../Services/AbstractArmService";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";

const localize = nls.loadMessageBundle();

export abstract class AbstractCosmosDbHomeDashboard extends AbstractHomeDashboard {
  constructor(
    reporter: TelemetryReporter,
    private armService: AbstractArmService,
    protected openDatabaseDashboardCommand: string
  ) {
    super(reporter);
  }

  public buildModel(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component {
    const viewItems: azdata.Component[] = [this.buildToolbar(view, context)];
    viewItems.push(this.buildOverview(view));
    viewItems.push(this.buildGettingStarted(view, context));

    return view.modelBuilder.flexContainer().withItems(viewItems).withLayout({ flexFlow: "column" }).component();
  }

  private buildOverview(view: azdata.ModelView): azdata.Component {
    this.refreshProperties = () => {
      const connectionInfo = view.connection;
      this.armService
        .retrieveDatabaseAccountInfo(
          connectionInfo.options["azureAccount"],
          connectionInfo.options["azureTenantId"],
          connectionInfo.options["azureResourceId"],
          this.armService.getAccountName(connectionInfo)
        )
        .then((databaseAccountInfo) => {
          const propertyItems: azdata.PropertiesContainerItem[] = [
            {
              displayName: localize("status", "Status"),
              value: databaseAccountInfo.serverStatus,
            },
            {
              displayName: localize("consistencyPolicy", "Consistency policy"),
              value: databaseAccountInfo.consistencyPolicy,
            },
            {
              displayName: localize("backupPolicy", "Backup policy"),
              value: databaseAccountInfo.backupPolicy,
            },
            {
              displayName: localize("readLocation", "Read location"),
              value: databaseAccountInfo.readLocations.join(","),
            },
          ];

          properties.propertyItems = propertyItems;
          component.loading = false;
        });
    };
    this.refreshProperties();

    const propertyItems: azdata.PropertiesContainerItem[] = [];
    const properties = view.modelBuilder.propertiesContainer().withProps({ propertyItems }).component();

    const overview = view.modelBuilder
      .divContainer()
      .withItems([properties])
      .withProps({
        CSSStyles: {
          padding: "10px",
          "border-bottom": "1px solid rgba(128, 128, 128, 0.35)",
        },
      })
      .component();

    const component = view.modelBuilder
      .loadingComponent()
      .withItem(overview)
      .withProps({
        loading: true,
      })
      .component();

    return component;
  }

  static createOpenInPortalButton(
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    reporter: TelemetryReporter,
    armService: AbstractArmService
  ): azdata.ButtonComponent {
    return buildHeroCard(
      view,
      context.asAbsolutePath("resources/fluent/azure.svg"),
      localize("openInPortal", "Open in portal"),
      localize("openInPortalDescription", "View and manage this account (e.g. backup settings) in Azure portal"),
      () => {
        this.openInPortal(view.connection, armService);
        reporter.sendActionEvent(
          Telemetry.sources.homeDashboard,
          Telemetry.actions.click,
          Telemetry.targets.homeDashboard.gettingStartedOpenInPortal
        );
      }
    );
  }

  private buildGettingStarted(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component {
    const heroCards: azdata.ButtonComponent[] = this.createGettingStartedDefaultButtons(view, context);

    const heroCardsContainer = view.modelBuilder
      .flexContainer()
      .withItems(heroCards, { flex: "0 0 auto" })
      .withLayout({ flexFlow: "row", flexWrap: "wrap" })
      .withProps({ CSSStyles: { width: "100%" } })
      .component();

    heroCardsContainer.addItem(
      AbstractCosmosDbHomeDashboard.createOpenInPortalButton(view, context, this.reporter, this.armService),
      { flex: "0 0 auto" }
    );

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
    const connection = view.connection;
    let databases: ICosmosDbDatabaseInfo[];

    this.refreshDatabases = () => {
      this.armService
        .retrieveDatabasesInfo(
          connection.options["azureAccount"],
          connection.options["azureTenantId"],
          connection.options["azureResourceId"],
          this.armService.getAccountName(connection)
        )
        .then((databasesInfo) => {
          databases = databasesInfo;
          tableComponent.data = databasesInfo.map((db) => [
            <azdata.HyperlinkColumnCellValue>{
              title: db.name,
              icon: context.asAbsolutePath("resources/fluent/database.svg"),
            },
            db.usageSizeKB === undefined ? localize("unknown", "Unknown") : db.usageSizeKB,
            db.nbCollections,
            <azdata.HyperlinkColumnCellValue>{
              title: db.throughputSetting,
            },
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
            value: "database",
            type: azdata.ColumnType.hyperlink,
            name: localize("database", "Database"),
            width: 250,
          },
          {
            value: localize("dataUsage", "Data Usage (KB)"),
            type: azdata.ColumnType.text,
          },
          {
            value: localize("collection", "Collections"),
            type: azdata.ColumnType.text,
          },
          <azdata.HyperlinkColumn>{
            value: "throughput",
            type: azdata.ColumnType.hyperlink,
            name: localize("throughputSharedAccrossCollection", "Throughput Shared Across Collections"),
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
        if (!databases) {
          return;
        }

        const databaseDashboardInfo: IDatabaseDashboardInfo = {
          databaseName: databases[arg.row].name,
          connectionId: connection.connectionId,
          ...convertToConnectionOptions(connection),
        };

        if (arg.name === "database") {
          vscode.commands.executeCommand(this.openDatabaseDashboardCommand, undefined, databaseDashboardInfo);
          this.reporter.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.databasesListAzureOpenDashboard
          );
        } else if (arg.name === "throughput" && databases[arg.row].throughputSetting !== "") {
          try {
            const result = await this.armService.changeDatabaseThroughput(
              databaseDashboardInfo.azureAccount,
              databaseDashboardInfo.azureTenantId,
              databaseDashboardInfo.azureResourceId,
              this.armService.getAccountNameFromOptions(databaseDashboardInfo),
              databases[arg.row]
            );
            if (result) {
              this.refreshDatabases && this.refreshDatabases();
            }
            this.reporter.sendActionEvent(
              Telemetry.sources.homeDashboard,
              Telemetry.actions.click,
              Telemetry.targets.homeDashboard.databasesListAzureChangeThroughput
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
            value: localize("databaseOverview", "Database overview"),
            CSSStyles: { "font-size": "20px", "font-weight": "600" },
          })
          .component(),
        view.modelBuilder
          .text()
          .withProps({
            value: localize("databaseOverviewDescription", "Click on a database for more details"),
          })
          .component(),
        tableLoadingComponent,
      ])
      .withLayout({ flexFlow: "column" })
      .withProps({ CSSStyles: { padding: "10px" } })
      .component();
  }

  private static async openInPortal(connectionInfo: azdata.ConnectionInfo, armService: AbstractArmService) {
    const azurePortalEndpoint = await armService.retrievePortalEndpoint(connectionInfo.options["azureAccount"]);
    const azureResourceId = await armService.retrieveResourceId(
      connectionInfo.options["azureAccount"],
      connectionInfo.options["azureTenantId"],
      connectionInfo.options["azureResourceId"],
      armService.getAccountName(connectionInfo)
    );
    if (!azurePortalEndpoint || !azureResourceId) {
      vscode.window.showErrorMessage(localize("missingAzureInformation", "Missing azure information from connection"));
      return;
    }
    const url = `${azurePortalEndpoint}/#@microsoft.onmicrosoft.com/resource${azureResourceId}/overview`;
    vscode.env.openExternal(vscode.Uri.parse(url));
  }
}
