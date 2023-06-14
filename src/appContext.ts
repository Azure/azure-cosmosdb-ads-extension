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

  // Cache view loader per container
  private _viewLoaders: Map<string, ViewLoader> = new Map<string, ViewLoader>();
  // Cache query results for infinite paging
  private _cachedQueryResultDocuments: Map<string, any> = new Map<string, any>();

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

  private static buildCacheKey(server: string, databaseName: string, containerName: string): string {
    return `${server}_${databaseName}_${containerName}`;
  }

  public getCachedQueryResultDocuments(server: string, databaseName: string, containerName: string): any {
    const key = AppContext.buildCacheKey(server, databaseName, containerName);
    return this._cachedQueryResultDocuments.get(key);
  }

  public setCachedQueryResultDocuments(server: string, databaseName: string, containerName: string, value: any) {
    const key = AppContext.buildCacheKey(server, databaseName, containerName);
    return this._cachedQueryResultDocuments.set(key, value);
  }

  public getViewLoader(
    server: string,
    databaseName: string,
    containerName: string,
    options: ViewLoaderOptions
  ): ViewLoader {
    const key = AppContext.buildCacheKey(server, databaseName, containerName);
    if (!this._viewLoaders.has(key)) {
      this._viewLoaders.set(key, new ViewLoader(options));
    }

    return this._viewLoaders.get(key)!;
  }

  public removeViewLoader(server: string, databaseName: string, containerName: string): void {
    const key = AppContext.buildCacheKey(server, databaseName, containerName);
    if (this._viewLoaders.has(key)) {
      this._viewLoaders.delete(key);
    }
  }
}
