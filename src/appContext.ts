import * as vscode from "vscode";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { MongoService } from "./Services/MongoService";
import { CosmosDbNoSqlService } from "./Services/CosmosDbNoSqlService";
import { ArmServiceMongo } from "./Services/ArmServiceMongo";
import { ArmServiceNoSql } from "./Services/ArmServiceNoSql";
import ViewLoader, { ViewLoaderOptions } from "./QueryClient/ViewLoader";

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
  public armServiceMongo: ArmServiceMongo;
  public armServiceNoSql: ArmServiceNoSql;

  // Cache view loader per server
  private _viewLoaders: Map<string, ViewLoader> = new Map<string, ViewLoader>();

  constructor(public reporter: TelemetryReporter) {
    this.mongoService = new MongoService();
    this.cosmosDbNoSqlService = new CosmosDbNoSqlService();
    this.armServiceMongo = new ArmServiceMongo();
    this.armServiceNoSql = new ArmServiceNoSql();
  }

  public dispose() {
    this.mongoService.dispose();
    this.cosmosDbNoSqlService.dispose();
    this._viewLoaders.forEach((viewLoader) => viewLoader.dispose());
  }

  public getViewLoader(server: string, options: ViewLoaderOptions): ViewLoader {
    if (!this._viewLoaders.has(server)) {
      this._viewLoaders.set(server, new ViewLoader(options));
    }

    return this._viewLoaders.get(server)!;
  }

  public removeViewLoader(server: string): void {
    if (this._viewLoaders.has(server)) {
      this._viewLoaders.delete(server);
    }
  }
}
