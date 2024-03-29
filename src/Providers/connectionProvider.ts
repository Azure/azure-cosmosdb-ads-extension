import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as semver from "semver";
import { v4 as uuid } from "uuid";
import { AppContext, hideStatusBarItem, showStatusBarItem } from "../appContext";
import { parseMongoConnectionString } from "./mongoConnectionString";
import { convertToConnectionOptions } from "../models";
import { AbstractBackendService } from "../Services/AbstractBackendService";
import { parseCosmosDbNoSqlConnectionString } from "./cosmosDbNoSqlConnectionString";

const localize = nls.loadMessageBundle();

export const MongoProviderId: string = "COSMOSDB_MONGO";
export const NoSqlProviderId: string = "COSMOSDB_NOSQL";

export class ConnectionProvider implements azdata.ConnectionProvider {
  constructor(private backendService: AbstractBackendService, public providerId: string) {}

  // Maintain current connections server <--> connectionUri
  private connectionUriToServerMap = new Map<string, string>();

  // Maintain current connections - connection string <--> connectionUri
  private connectionUriToConnectionStringMap = new Map<string, string | undefined>();

  private onConnectionCompleteEmitter: vscode.EventEmitter<azdata.ConnectionInfoSummary> = new vscode.EventEmitter();
  onConnectionComplete: vscode.Event<azdata.ConnectionInfoSummary> = this.onConnectionCompleteEmitter.event;

  private onIntelliSenseCacheCompleteEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter();
  onIntelliSenseCacheComplete: vscode.Event<string> = this.onIntelliSenseCacheCompleteEmitter.event;

  private onConnectionChangedEmitter: vscode.EventEmitter<azdata.ChangedConnectionInfo> = new vscode.EventEmitter();
  onConnectionChanged: vscode.Event<azdata.ChangedConnectionInfo> = this.onConnectionChangedEmitter.event;

  async connect(connectionUri: string, connectionInfo: azdata.ConnectionInfo): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      const showErrorMessage = (errorMessage: string) => {
        this.onConnectionCompleteEmitter.fire({
          ownerUri: connectionUri,
          errorMessage,
        } as any);
      };

      console.log(`ConnectionProvider.connect ${connectionUri}`);

      const server = connectionInfo.options[AppContext.CONNECTION_INFO_KEY_PROP];
      const connectionOptions = convertToConnectionOptions(connectionInfo);
      this.connectionUriToServerMap.set(connectionUri, server);

      let connectionString;
      try {
        connectionString = await this.backendService.retrieveConnectionStringFromConnectionOptions(
          connectionOptions,
          true
        );
        this.connectionUriToConnectionStringMap.set(connectionUri, connectionString);
      } catch (e) {
        const errorMessage = (e as Error).message;
        showErrorMessage(errorMessage);
        return reject(errorMessage);
      }

      if (!connectionString) {
        const errorMessage = localize("failRetrieveCredentials", "Unable to retrieve credentials");
        showErrorMessage(errorMessage);
        return reject(errorMessage);
      }

      try {
        showStatusBarItem(localize("connecting", "Connecting to {0}...", server));
        await this.backendService.connect(server, connectionString);
      } catch (e) {
        const errorMessage = `${localize("failConnect", "Failed to connect")}: ${(e as Error).message}`;
        showErrorMessage(errorMessage);
        return reject(errorMessage);
      } finally {
        hideStatusBarItem();
      }

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
      return resolve(true);
    });
  }

  disconnect(connectionUri: string): Promise<boolean> {
    console.log("ConnectionProvider.disconnect");
    if (!this.connectionUriToServerMap.has(connectionUri)) {
      return Promise.reject(`ConnectionUri unknown: ${connectionUri}`);
    }

    this.backendService.disconnect(this.connectionUriToServerMap.get(connectionUri)!);
    this.connectionUriToServerMap.delete(connectionUri);
    this.connectionUriToConnectionStringMap.delete(connectionUri);

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
    const connectionString = this.connectionUriToConnectionStringMap.get(connectionUri);
    if (connectionString) {
      return Promise.resolve(connectionString);
    } else {
      return Promise.resolve("");
    }
  }

  // Called when something is pasted to Server field (Mongo account)
  buildConnectionInfo?(connectionString: string): Promise<azdata.ConnectionInfo> {
    console.log("ConnectionProvider.buildConnectionInfo");
    try {
      let info;
      if (this.providerId === MongoProviderId) {
        info = parseMongoConnectionString(connectionString);
      } else if (this.providerId === NoSqlProviderId) {
        info = parseCosmosDbNoSqlConnectionString(connectionString);
      }

      if (info) {
        return Promise.resolve(info);
      }
    } catch (e) {
      console.error("Invalid MongoDB connection string", e);
      if (semver.gte(azdata.version, "1.43.0")) {
        // older ADS won't handle reject properly
        return Promise.reject(e);
      }
    }
    return undefined!;
  }
  registerOnConnectionComplete(handler: (connSummary: azdata.ConnectionInfoSummary) => any): vscode.Disposable {
    console.log("ConnectionProvider.registerOnConnectionComplete");
    this.onConnectionComplete((e) => {
      handler(e);
    });
    return { dispose: () => {} };
  }
  registerOnIntelliSenseCacheComplete(handler: (connectionUri: string) => any): vscode.Disposable {
    console.log("IntellisenseCache complete");
    return { dispose: () => {} };
  }
  registerOnConnectionChanged(handler: (changedConnInfo: azdata.ChangedConnectionInfo) => any): vscode.Disposable {
    console.log("Connection changed");
    return { dispose: () => {} };
  }
  handle?: number;
}
