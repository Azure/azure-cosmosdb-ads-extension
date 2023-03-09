import * as vscode from "vscode";
import * as nls from "vscode-nls";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { MongoService } from "./Services/MongoService";
import { CosmosDbNoSqlService } from "./Services/CosmosDbNoSqlService";

let statusBarItem: vscode.StatusBarItem | undefined = undefined;

export const createStatusBarItem = (): void => {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
};

export const showStatusBarItem = (text: string): void => {
  if (statusBarItem) {
    statusBarItem.text = text;
    statusBarItem.show();
  }
};

export const hideStatusBarItem = (): void => {
  if (statusBarItem) {
    statusBarItem.hide();
  }
};

export class AppContext {
  public static readonly CONNECTION_INFO_KEY_PROP = "server"; // Unique key to store connection info against

  public mongoService: MongoService;
  public cosmosDbNoSqlService: CosmosDbNoSqlService;

  constructor(public reporter: TelemetryReporter) {
    this.mongoService = new MongoService();
    this.cosmosDbNoSqlService = new CosmosDbNoSqlService();
  }
}
