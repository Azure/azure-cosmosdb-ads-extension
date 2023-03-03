import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { COSMOSDB_DOC_URL, Telemetry } from "../constant";
import { IConnectionNodeInfo } from "../extension";
import { convertToConnectionOptions } from "../models";
import { buildHeroCard } from "../util";

const localize = nls.loadMessageBundle();

export abstract class AbstractHomeDashboardMongo {
  protected refreshProperties?: () => void = undefined;
  protected refreshDatabases?: () => void = undefined;
  public abstract buildModel(
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext
  ): azdata.Component;
  public abstract buildDatabasesArea(
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext
  ): Promise<azdata.Component>;

  protected buildToolbar(
    view: azdata.ModelView,
    context: vscode.ExtensionContext,
    appContext: AppContext
  ): azdata.ToolbarContainer {
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
          appContext.reporter?.sendActionEvent(
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
        onDidClick() {
          vscode.commands.executeCommand(
            "cosmosdb-ads-extension.openMongoShell",
            convertToConnectionOptions(view.connection)
          );
          appContext.reporter?.sendActionEvent(
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
          appContext.reporter?.sendActionEvent(
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
        onDidClick() {
          vscode.env.openExternal(vscode.Uri.parse(COSMOSDB_DOC_URL));
          appContext.reporter?.sendActionEvent(
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
    context: vscode.ExtensionContext,
    appContext: AppContext
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
          appContext.reporter?.sendActionEvent(
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
          appContext.reporter?.sendActionEvent(
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
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.homeDashboard,
            Telemetry.actions.click,
            Telemetry.targets.homeDashboard.gettingStartedDocumentation
          );
        }
      ),
    ];
  }
}
