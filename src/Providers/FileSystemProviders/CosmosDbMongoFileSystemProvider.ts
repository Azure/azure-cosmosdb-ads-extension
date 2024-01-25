import * as vscode from "vscode";
import { AbstractCosmosDbFileSystemProvider } from "./AbstractCosmosDbFileSystemProvider";
import { MongoService } from "../../Services/MongoService";

export class CosmosDbMongoFileSystemProvider extends AbstractCosmosDbFileSystemProvider {
  /*
   * Simulate a file system where each document is exposed as a "virtual" file which can be edited by vscode.
   * The scheme is: cdbmongo:/server/database/container/id.json
   */
  public static readonly SCHEME = "cdbmongo";
  public static readonly NEW_DOCUMENT_FILENAME = "new_mongo.json";

  constructor(private mongoService: MongoService) {
    super();
  }

  protected insertIntoCosmosDb(uri: vscode.Uri, contentJson: any): Promise<{ count: number; elapsedTimeMS: number }> {
    const { server, database, container } = this.getContainerInfo(uri);
    return this.mongoService.insertDocuments(server, database, container, [contentJson]);
  }
}
