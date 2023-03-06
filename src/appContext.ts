import { Collection, Document, MongoClient, MongoClientOptions } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as azdata from "azdata";
import { ProviderId } from "./Providers/connectionProvider";
import { CosmosDBManagementClient, Database } from "@azure/arm-cosmosdb";
import { MonitorManagementClient } from "@azure/arm-monitor";
import { ResourceGraphClient } from "@azure/arm-resourcegraph";
import { TokenCredentials } from "@azure/ms-rest-js";
import {
  MongoDBCollectionCreateUpdateParameters,
  MongoDBDatabaseCreateUpdateParameters,
  ThroughputSettingsGetPropertiesResource,
} from "@azure/arm-cosmosdb/esm/models";
import { getServerState } from "./Dashboards/ServerUXStates";
import { getUsageSizeInKB } from "./Dashboards/getCollectionDataUsageSize";
import { isCosmosDBAccount } from "./MongoShell/mongoUtils";
import { buildMongoConnectionString } from "./Providers/connectionString";
import {
  convertToConnectionOptions,
  IConnectionOptions,
  ICosmosDbCollectionInfo,
  ICosmosDbDatabaseAccountInfo,
  ICosmosDbDatabaseInfo,
  IDatabaseInfo,
  IMongoShellOptions,
} from "./models";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "./extension";
import { createNodePath } from "./Providers/objectExplorerNodeProvider";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import {
  createNewCollectionDialog,
  createNewDatabaseDialog,
  NewCollectionFormData,
  NewDatabaseFormData,
} from "./dialogUtil";
import { CdbCollectionCreateInfo } from "./sampleData/DataSamplesUtil";
import { EditorUserQuery, EditorQueryResult } from "./QueryClient/messageContract";
import { NativeMongoService } from "./Services/NativeMongoService";
import { CosmosDbMongoService } from "./Services/CosmosDbMongoService";

let statusBarItem: vscode.StatusBarItem | undefined = undefined;
const localize = nls.loadMessageBundle();

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

  public nativeMongoService;
  public cosmosDbMongoService;

  constructor(public reporter: TelemetryReporter) {
    this.nativeMongoService = new NativeMongoService();
    this.cosmosDbMongoService = new CosmosDbMongoService();
  }
}
