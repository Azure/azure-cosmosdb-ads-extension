import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";

export abstract class AbstractHomeDashboard {
  protected refreshProperties?: () => void = undefined;
  protected refreshDatabases?: () => void = undefined;

  protected constructor(protected reporter: TelemetryReporter) {}

  public abstract buildModel(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component;
  public abstract buildDatabasesArea(
    view: azdata.ModelView,
    context: vscode.ExtensionContext
  ): Promise<azdata.Component>;

  protected abstract buildToolbar(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.ToolbarContainer;
  protected abstract createGettingStartedDefaultButtons(
    view: azdata.ModelView,
    context: vscode.ExtensionContext
  ): azdata.ButtonComponent[];
}
