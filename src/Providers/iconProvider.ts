import * as azdata from "azdata";
import { MongoProviderId, NoSqlProviderId } from "./connectionProvider";

const IconId = "cosmosdb";
export class MongoIconProvider implements azdata.IconProvider {
  public readonly providerId: string = MongoProviderId;
  public handle?: number;
  getConnectionIconId(
    connection: azdata.IConnectionProfile,
    serverInfo: azdata.ServerInfo
  ): Thenable<string | undefined> {
    return Promise.resolve(IconId);
  }
}

export class NoSqlIconProvider extends MongoIconProvider {
  public readonly providerId: string = NoSqlProviderId;
}
