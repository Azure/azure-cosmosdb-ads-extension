import * as vscode from "vscode";
import * as azdata from "azdata";
import * as nls from "vscode-nls";
import { CosmosClient } from "@azure/cosmos";
import { IConnectionOptions, IDatabaseInfo } from "../models";
import { MongoClient } from "mongodb";
import { AbstractArmService } from "./AbstractArmService";
import { buildMongoConnectionString } from "../Providers/connectionString";

const localize = nls.loadMessageBundle();

export abstract class AbstractBackendService {
  constructor(protected armService: AbstractArmService) {}

  public abstract connect(server: string, connectionString: string): Promise<MongoClient | CosmosClient | undefined>;
  public abstract disconnect(server: string): Promise<void> | void;
  public abstract listDatabases(server: string): Promise<IDatabaseInfo[]>;

  public retrieveConnectionStringFromConnectionOptions = async (
    connectionOptions: IConnectionOptions,
    retrievePasswordFromAzData: boolean
  ): Promise<string | undefined> => {
    const authenticationType = connectionOptions.authenticationType;

    if (retrievePasswordFromAzData && (authenticationType === "SqlLogin" || authenticationType === "Integrated")) {
      // Retrieve password
      const serverName = connectionOptions.server;
      if (!serverName) {
        vscode.window.showErrorMessage(localize("missingServerName", "Missing serverName {0}", serverName));
        return undefined;
      }

      const connection = (await azdata.connection.getConnections()).filter((c) => c.serverName === serverName);
      if (connection.length < 1) {
        vscode.window.showErrorMessage(
          localize("failRetrieveCredentials", "Unable to retrieve credentials for {0}", serverName)
        );
        return undefined;
      }
      const credentials = await azdata.connection.getCredentials(connection[0].connectionId);
      connectionOptions.password = credentials["password"];
    }

    switch (authenticationType) {
      case "AzureMFA":
        try {
          return this.armService.retrieveConnectionStringFromArm(
            connectionOptions.azureAccount,
            connectionOptions.azureTenantId,
            connectionOptions.azureResourceId,
            connectionOptions.server
          );
        } catch (e) {
          vscode.window.showErrorMessage((e as { message: string }).message);
          return undefined;
        }
      case "SqlLogin":
      case "Integrated":
        return buildMongoConnectionString(connectionOptions);
      default:
        // Should never happen
        vscode.window.showErrorMessage(
          localize("unsupportedAuthenticationType", "Unsupposed authentication type {0}", authenticationType)
        );
        return undefined;
    }
  };
}
