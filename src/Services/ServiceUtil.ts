import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as azdata from "azdata";
import { MongoProviderId } from "../Providers/connectionProvider";
import { convertToConnectionOptions, IConnectionOptions } from "../models";

const localize = nls.loadMessageBundle();

type ConnectionPick = azdata.connection.ConnectionProfile & vscode.QuickPickItem;

export const askUserForConnectionProfile = async (): Promise<ConnectionPick | undefined> => {
  const connections = await azdata.connection.getConnections();
  const picks: ConnectionPick[] = connections
    .filter((c) => c.providerId === MongoProviderId)
    .map((c) => ({
      ...c,
      label: c.connectionName || c.serverName,
    }));

  return vscode.window.showQuickPick<ConnectionPick>(picks, {
    placeHolder: localize("selectMongoAccount", "Select mongo account"),
  });
};

export interface SampleData {
  databaseId: string;
  collectionId: string;
  offerThroughput?: number;
  data: any[];
  databaseLevelThroughput?: boolean;
  createNewDatabase?: boolean;
  partitionKey?: {
    kind: string;
    paths: string[];
    version: number;
  };
}

export const isAzureConnection = (connectionInfo: azdata.ConnectionInfo | IConnectionOptions): boolean => {
  const info = "options" in connectionInfo ? convertToConnectionOptions(connectionInfo) : connectionInfo;
  if (isAzureAuthType(info.authenticationType)) {
    return true;
  }
  if (info.azureAccount !== undefined && info.azureResourceId !== undefined && info.azureTenantId !== undefined) {
    return true;
  }
  /*
    const server: string = connectionInfo.options["server"];//
    let startDomain: number;
    const clusterDomain = ".mongocluster.cosmos.azure.com";
    if ((startDomain = server.indexOf(clusterDomain)) > 0 && server.length === startDomain + clusterDomain.length) {
      return true;
    }
    */
  return false;
};

export const isAzureAuthType = (authenticationType: string | undefined): boolean => authenticationType === "AzureMFA";
