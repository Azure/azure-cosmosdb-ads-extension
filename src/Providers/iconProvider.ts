import * as azdata from "azdata";
import { ProviderId } from "./connectionProvider";

const IconId = "myprovidericon";
export class IconProvider implements azdata.IconProvider {
  public readonly providerId: string = ProviderId;
  public handle?: number;
  getConnectionIconId(
    connection: azdata.IConnectionProfile,
    serverInfo: azdata.ServerInfo
  ): Thenable<string | undefined> {
    return Promise.resolve(IconId);
  }
}
