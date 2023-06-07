import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { IDatabaseDashboardInfo } from "../extension";
import { convertToConnectionOptions } from "../models";

const localize = nls.loadMessageBundle();

export abstract class AbstractDatabaseDashboard {
  protected refreshContainers?: () => void = undefined;

  constructor(protected providerId: string) {}

  protected abstract buildToolbar(
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): azdata.ToolbarContainer;

  protected abstract buildWorkingWithDatabase(
    view: azdata.ModelView,
    appContext: AppContext,
    context: vscode.ExtensionContext,
    databaseDashboardInfo: IDatabaseDashboardInfo
  ): azdata.Component;

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

  protected abstract buildContainersArea(
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
      const viewItem = await this.buildContainersArea(databaseName, view, context, appContext, databaseDashboardInfo);

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
