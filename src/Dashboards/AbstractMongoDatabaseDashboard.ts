import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { Telemetry } from "../constant";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { ingestSampleMongoData } from "../sampleData/DataSamplesUtil";
import { buildHeroCard } from "../util";
import { AbstractDatabaseDashboard } from "./AbstractDatabaseDashboard";

const localize = nls.loadMessageBundle();

export abstract class AbstractMongoDatabaseDashboard extends AbstractDatabaseDashboard {
  protected refreshCollections?: () => void = undefined;

  protected buildToolbar(
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

  protected buildWorkingWithDatabase(
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
}
