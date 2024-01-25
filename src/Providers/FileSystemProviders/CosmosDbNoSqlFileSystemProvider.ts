import * as vscode from "vscode";
import { AbstractCosmosDbFileSystemProvider } from "./AbstractCosmosDbFileSystemProvider";
import { CosmosDbNoSqlService } from "../../Services/CosmosDbNoSqlService";

export class CosmosDbNoSqlFileSystemProvider extends AbstractCosmosDbFileSystemProvider {
  /*
   * Simulate a file system where each document is exposed as a "virtual" file which can be edited by vscode.
   * The scheme is: cdbnosql:/server/database/container/id.json
   */
  public static readonly SCHEME = "cdbnosql";
  public static readonly NEW_DOCUMENT_FILENAME = "new_nosql.json";

  constructor(private nosqlService: CosmosDbNoSqlService) {
    super();
  }

  protected insertIntoCosmosDb(uri: vscode.Uri, contentJson: any): Promise<{ count: number; elapsedTimeMS: number }> {
    const { server, database, container } = this.getContainerInfo(uri);
    return this.nosqlService.insertDocuments(server, database, container, [contentJson]);
  }
}
