import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { Telemetry } from "../constant";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { ingestSampleMongoData } from "../sampleData/DataSamplesUtil";
import { buildHeroCard } from "../util";
import { convertToConnectionOptions } from "../models";

const localize = nls.loadMessageBundle();

export abstract class AbstractDatabaseDashboard {
  protected refreshCollections?: () => void = undefined;

  constructor(private providerId: string) {}

  private buildToolbar(
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): azdata.ToolbarContainer {
    const buttons: (azdata.ButtonProperties & { onDidClick: () => void })[] = [
      {
        label: localize("newCollection", "New Collection"),
        iconPath: {
          light: context.asAbsolutePath("resources/light/add-collection.svg"),
          dark: context.asAbsolutePath("resources/dark/add-collection-inverse.svg"),
        },
        onDidClick: () => {
          const param: IConnectionNodeInfo = {
            ...databaseDashboardInfo,
            nodePath: createNodePath(databaseDashboardInfo.server, databaseDashboardInfo.databaseName),
          };
          vscode.commands
            .executeCommand("cosmosdb-ads-extension.createMongoCollection", undefined, param)
            .then(() => this.refreshCollections && this.refreshCollections());
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.toolbarNewCollection
          );
        },
      },
      {
        label: localize("openMongoShell", "Open Mongo Shell"),
        iconPath: {
          light: context.asAbsolutePath("resources/light/mongo-shell.svg"),
          dark: context.asAbsolutePath("resources/dark/mongo-shell-inverse.svg"),
        },
        onDidClick() {
          vscode.commands.executeCommand(
            "cosmosdb-ads-extension.openMongoShell",
            { ...databaseDashboardInfo },
            databaseDashboardInfo.databaseName
          );
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.toolbarOpenMongoShell
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
          this.refreshCollections && this.refreshCollections();
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.toolbarRefresh
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

  private buildWorkingWithDatabase(
    view: azdata.ModelView,
    appContext: AppContext,
    context: vscode.ExtensionContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): azdata.Component {
    const heroCards: azdata.ButtonComponent[] = [
      buildHeroCard(
        view,
        context.asAbsolutePath("resources/fluent/new-collection.svg"),
        localize("newCollection", "New Collection"),
        localize("newCollectionDescription", "Create a new collection to store you data"),
        () => {
          const param: IConnectionNodeInfo = {
            ...databaseDashboardInfo,
            nodePath: createNodePath(databaseDashboardInfo.server, databaseDashboardInfo.databaseName),
          };
          vscode.commands
            .executeCommand("cosmosdb-ads-extension.createMongoCollection", undefined, param)
            .then(() => this.refreshCollections && this.refreshCollections());
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.gettingStartedNewCollection
          );
        }
      ),
      buildHeroCard(
        view,
        context.asAbsolutePath("resources/fluent/new-collection.svg"),
        localize("importSampleData", "Import Sample Data"),
        localize("sampleCollectionDescription", "Create a new collection using one of our sample datasets"),
        () => {
          ingestSampleMongoData(appContext, context, databaseDashboardInfo).then(
            () => this.refreshCollections && this.refreshCollections()
          );
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.gettingStartedImportSampleData
          );
        }
      ),
    ];

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
            CSSStyles: { "font-family": "20px", "font-weight": "600" },
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

  private buildBreadcrumb(view: azdata.ModelView, accountName: string, databaseName: string): azdata.Component {
    const CSSStyles = { marginTop: 0, marginBottom: 0 };
    const home = view.modelBuilder.text().withProps({ value: "Home", CSSStyles }).component();

    // TODO: left and right margins don't work on righArrow, and spaces are trimmed, so we use this for spacers
    const space1 = view.modelBuilder
      .text()
      .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
      .component();
    const rightArrow = view.modelBuilder.text().withProps({ value: ">", CSSStyles }).component();
    const space2 = view.modelBuilder
      .text()
      .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
      .component();

    const accountLink = view.modelBuilder.hyperlink().withProps({ label: accountName, url: "" }).component();
    const space3 = view.modelBuilder
      .text()
      .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
      .component();
    const rightArrow2 = view.modelBuilder.text().withProps({ value: ">", CSSStyles }).component();
    const space4 = view.modelBuilder
      .text()
      .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
      .component();

    const database = view.modelBuilder.text().withProps({ value: databaseName, CSSStyles }).component();

    accountLink.onDidClick(async (_) => {
      this.openAccountDashboard(accountName);
    });

    return view.modelBuilder
      .flexContainer()
      .withItems([home, space1, rightArrow, space2, accountLink, space3, rightArrow2, space4, database], {
        flex: "0 0 auto",
        CSSStyles: { gap: 10, paddingRight: 10 },
      })
      .withLayout({ flexFlow: "row", flexWrap: "wrap", justifyContent: "flex-start" })
      .withProps({
        CSSStyles: {
          padding: "10px",
          "border-bottom": "1px solid rgba(128, 128, 128, 0.35)",
        },
      })
      .component();
  }

  protected abstract buildCollectionsArea(
    databaseName: string,
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): Promise<azdata.Component>;

  public async openDatabaseDashboard(
    databaseDashboardInfo: IDatabaseDashboardInfo,
    appContext: AppContext,
    context: vscode.ExtensionContext
  ): Promise<void> {
    const databaseName = databaseDashboardInfo.databaseName ?? "Unknown Database";
    const dashboard = azdata.window.createModelViewDashboard(databaseName);
    dashboard.registerTabs(async (view: azdata.ModelView) => {
      const input1 = view.modelBuilder.inputBox().withProps({ value: databaseDashboardInfo.databaseName }).component();
      const viewItem = await this.buildCollectionsArea(databaseName, view, context, appContext, databaseDashboardInfo);

      const homeTabContainer = view.modelBuilder
        .flexContainer()
        .withItems([
          this.buildBreadcrumb(view, databaseDashboardInfo.server, databaseName),
          this.buildToolbar(view, context, appContext, databaseDashboardInfo),
          this.buildWorkingWithDatabase(view, appContext, context, databaseDashboardInfo),
          viewItem,
        ])
        .withLayout({ flexFlow: "column" })
        .component();

      const homeTab: azdata.DashboardTab = {
        id: "home",
        // TODO depending on how breadcrumb is eventually exposed in ADS, we may have to uncomment this
        // toolbar: buildToolbar(view, context, appContext, databaseDashboardInfo),
        content: homeTabContainer,
        title: "Home",
        icon: context.asAbsolutePath("resources/fluent/home.svg"), // icon can be the path of a svg file
      };

      // TODO Implement this tab
      const collectionsTab: azdata.DashboardTab = {
        id: "collections",
        content: input1,
        title: localize("collections", "Collections"),
        icon: context.asAbsolutePath("resources/fluent/collection.svg"),
      };

      return [homeTab /*, collectionsTab */];
    });
    await dashboard.open();
  }

  private openAccountDashboard = async (accountName: string) => {
    const connections = (await azdata.connection.getConnections()).filter((c) => c.serverName === accountName);
    if (connections.length < 1) {
      vscode.window.showErrorMessage(localize("noAccountFound", "No account found for {0}", accountName));
      return;
    }

    const connectionOptions = convertToConnectionOptions(connections[0]);

    if (connectionOptions.authenticationType === "SqlLogin" || connectionOptions.authenticationType === "Integrated") {
      const credentials = await azdata.connection.getCredentials(connections[0].connectionId);
      connectionOptions.password = credentials["password"];
    }

    const connectionProfile: azdata.IConnectionProfile = {
      ...connections[0],
      providerName: this.providerId,
      id: connections[0].connectionId,
      azureAccount: connectionOptions.azureAccount,
      azureTenantId: connectionOptions.azureTenantId,
      azureResourceId: connectionOptions.azureResourceId,
      password: connectionOptions.password,
    };
    await azdata.connection.connect(connectionProfile, false, true);
  };
}
