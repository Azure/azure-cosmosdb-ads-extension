import * as vscode from "vscode";
import * as azdata from "azdata";

export interface IDatabaseInfo {
  name: string;
  sizeOnDisk?: number;
  empty?: boolean;
}

export interface ICosmosDbDatabaseAccountInfo {
  serverStatus: string;
  backupPolicy: string;
  consistencyPolicy: string;
  readLocations: string[];
  location: string;
  documentEndpoint: string | undefined;
}

export interface ICosmosDbDatabaseInfo {
  name: string;
  nbCollections: number;
  throughputSetting: string;
  usageSizeKB: number | undefined;
  isAutoscale: boolean;
  currentThroughput: number | undefined;
}

export interface ICosmosDbCollectionInfo {
  name: string;
  documentCount: number | undefined;
  throughputSetting: string;
  usageSizeKB: number | undefined;
  isAutoscale: boolean;
  currentThroughput: number | undefined;
}

export interface IMongoShellOptions {
  isCosmosDB: boolean;
  connectionString: string | undefined;
  connectionInfo:
    | {
        hostname: string;
        port: string | undefined;
        username: string | undefined;
        password: string | undefined;
      }
    | undefined;
}

export interface IConnectionOptions {
  server: string;
  authenticationType: string;
  azureAccount: string;
  azureTenantId: string;
  azureResourceId: string;
  user: string;
  password: string;
  pathname: string;
  search: string;
  isServer: boolean;
}

export const convertToConnectionOptions = (connectionInfo: azdata.ConnectionInfo): IConnectionOptions => ({
  server: connectionInfo.options["server"],
  authenticationType: connectionInfo.options["authenticationType"],
  azureAccount: connectionInfo.options["azureAccount"],
  azureResourceId: connectionInfo.options["azureResourceId"],
  azureTenantId: connectionInfo.options["azureTenantId"],
  user: connectionInfo.options["user"],
  password: connectionInfo.options["password"],
  pathname: connectionInfo.options["pathname"],
  search: connectionInfo.options["search"],
  isServer: connectionInfo.options["isServer"],
});
