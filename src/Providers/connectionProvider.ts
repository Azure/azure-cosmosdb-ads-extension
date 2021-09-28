import * as azdata from "azdata";
import * as vscode from "vscode";
import { v4 as uuid } from "uuid";
import { AppContext, retrieveConnectionStringFromArm } from "../appContext";

export const ProviderId: string = "COSMOSDB_MONGO";

export class ConnectionProvider implements azdata.ConnectionProvider {
  constructor(private appContext: AppContext) {}

  // Maintain current connections server <--> connectionUri
  private connectionUriToServerMap = new Map<string, string>();

  private onConnectionCompleteEmitter: vscode.EventEmitter<azdata.ConnectionInfoSummary> = new vscode.EventEmitter();
  onConnectionComplete: vscode.Event<azdata.ConnectionInfoSummary> = this.onConnectionCompleteEmitter.event;

  private onIntelliSenseCacheCompleteEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter();
  onIntelliSenseCacheComplete: vscode.Event<string> = this.onIntelliSenseCacheCompleteEmitter.event;

  private onConnectionChangedEmitter: vscode.EventEmitter<azdata.ChangedConnectionInfo> = new vscode.EventEmitter();
  onConnectionChanged: vscode.Event<azdata.ChangedConnectionInfo> = this.onConnectionChangedEmitter.event;

  async connect(connectionUri: string, connectionInfo: azdata.ConnectionInfo): Promise<boolean> {
    console.log(`ConnectionProvider.connect ${connectionUri}`);
    // For now, pass connection string in password
    console.log("connectionInfo", connectionInfo);

    const server = connectionInfo.options[AppContext.CONNECTION_INFO_KEY_PROP];
    this.connectionUriToServerMap.set(connectionUri, server);

    let password = connectionInfo.options["password"];

    if (connectionInfo.options["authenticationType"] === "AzureMFA") {
      try {
        password = await retrieveConnectionStringFromArm(connectionInfo);
      } catch (e) {
        vscode.window.showErrorMessage((e as { message: string }).message);
        return false;
      }
    }

    if (!password) {
      vscode.window.showErrorMessage("Unable to retrieve credentials");
      return false;
    }

    await this.appContext.connect(server, password);

    this.onConnectionCompleteEmitter.fire({
      connectionId: uuid(),
      ownerUri: connectionUri,
      messages: "",
      errorMessage: "",
      errorNumber: 0,
      connectionSummary: {
        serverName: "",
        userName: "",
      },
      serverInfo: {
        serverReleaseVersion: 1,
        engineEditionId: 1,
        serverVersion: "1.0",
        serverLevel: "",
        serverEdition: "",
        isCloud: true,
        azureVersion: 1,
        osVersion: "",
        options: {},
      },
    });
    return Promise.resolve(true);
  }
  disconnect(connectionUri: string): Promise<boolean> {
    console.log("ConnectionProvider.disconnect");
    if (!this.connectionUriToServerMap.has(connectionUri)) {
      return Promise.reject(`ConnectionUri unknown: ${connectionUri}`);
    }

    this.appContext.disconnect(this.connectionUriToServerMap.get(connectionUri)!);
    this.connectionUriToServerMap.delete(connectionUri);

    return Promise.resolve(true);
  }
  cancelConnect(connectionUri: string): Promise<boolean> {
    console.log("ConnectionProvider.cancelConnect");
    return Promise.resolve(true);
  }
  listDatabases(connectionUri: string): Promise<azdata.ListDatabasesResult> {
    console.log("ConnectionProvider.listDatabases");
    return Promise.resolve({
      databaseNames: ["master", "msdb"],
    });
  }
  changeDatabase(connectionUri: string, newDatabase: string): Promise<boolean> {
    console.log("ConnectionProvider.changeDatabase");
    return Promise.resolve(true);
  }
  rebuildIntelliSenseCache(connectionUri: string): Promise<void> {
    console.log("ConnectionProvider.rebuildIntelliSenseCache");
    return Promise.resolve();
  }
  getConnectionString(connectionUri: string, includePassword: boolean): Promise<string> {
    console.log("ConnectionProvider.getConnectionString");
    return Promise.resolve("conn_string");
  }
  buildConnectionInfo?(connectionString: string): Promise<azdata.ConnectionInfo> {
    console.log("ConnectionProvider.buildConnectionInfo");
    return Promise.resolve({
      options: [],
    });
  }
  registerOnConnectionComplete(handler: (connSummary: azdata.ConnectionInfoSummary) => any): void {
    console.log("ConnectionProvider.registerOnConnectionComplete");
    this.onConnectionComplete((e) => {
      handler(e);
    });
  }
  registerOnIntelliSenseCacheComplete(handler: (connectionUri: string) => any): void {
    console.log("IntellisenseCache complete");
  }
  registerOnConnectionChanged(handler: (changedConnInfo: azdata.ChangedConnectionInfo) => any): void {
    console.log("Connection changed");
  }
  handle?: number;
  providerId: string = ProviderId;
}
