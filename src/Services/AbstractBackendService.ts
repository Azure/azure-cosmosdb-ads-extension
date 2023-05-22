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

  /**
   * Connect to a server.
   * May throw an error if the connection fails: make sure to catch it.
   * @param server - The server to connect to
   * @param connectionString - The connection string to use
   * @returns client
   */
  public abstract connect(server: string, connectionString: string): Promise<MongoClient | CosmosClient>;
  public abstract disconnect(server: string): Promise<void> | void;
  public abstract listDatabases(server: string): Promise<IDatabaseInfo[]>;
  public abstract getDocuments(serverName: string, databaseName: string, containerName: string): Promise<unknown[]>;

  public retrieveConnectionStringFromConnectionOptions = async (
    connectionOptions: IConnectionOptions,
    retrievePasswordFromAzData: boolean
  ): Promise<string | undefined> => {
    const authenticationType = connectionOptions.authenticationType;

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
        const serverName = connectionOptions.server;
        if (!connectionOptions.password && retrievePasswordFromAzData) {
          // Retrieve password
          if (!serverName) {
            vscode.window.showErrorMessage(localize("missingServerName", "Missing serverName {0}", serverName));
            return undefined;
          }

          const connection = (await azdata.connection.getConnections()).filter((c) => c.serverName === serverName);
          if (connection.length > 0) {
            const credentials = await azdata.connection.getCredentials(connection[0].connectionId);
            connectionOptions.password = credentials["password"];
          }
        }
        if (!connectionOptions.password) {
          vscode.window.showErrorMessage(
            localize(
              "failRetrieveCredentials",
              "Unable to retrieve credentials for {0}. Please manuallyenter your credentials.",
              serverName
            )
          );
          return undefined;
        }
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
