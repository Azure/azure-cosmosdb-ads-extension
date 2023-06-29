import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { CosmosDbNoSqlService } from "../Services/CosmosDbNoSqlService";

const localize = nls.loadMessageBundle();

export class CdbFileStat implements vscode.FileStat {
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  constructor(size: number) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
  }
}

export class CosmosDbNoSqlFileSystemProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  // In-memory cache of documents
  private docMap = new Map<string, string>();

  /*
   * Simulate a file system where each document is exposed as a "virtual" file which can be edited by vscode.
   * The scheme is: cdbnosql:/server/database/container/id.json
   */
  public static readonly SCHEME = "cdbnosql";
  public static readonly NEW_DOCUMENT_FILENAME = "new.json";

  constructor(private nosqlService: CosmosDbNoSqlService) {}

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  watch(
    uri: vscode.Uri,
    options: { readonly recursive: boolean; readonly excludes: readonly string[] }
  ): vscode.Disposable {
    throw new Error(localize("notImplemented", "Method watch not implemented"));
  }

  stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
    if (this.docMap.has(uri.toString())) {
      return new CdbFileStat(this.docMap.get(uri.toString())!.length);
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    throw new Error(localize("notImplemented", "Method readDirectory not implemented"));
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    // TODO for now, we assume that the directory exists
    Promise.resolve();
  }

  readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
    console.log("uri", uri.toString());

    if (this.docMap.has(uri.toString())) {
      const encoder = new TextEncoder(); // always utf-8
      return encoder.encode(this.docMap.get(uri.toString()));
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  private async closeFileIfOpen(file: vscode.Uri): Promise<void> {
    const tabs: vscode.Tab[] = vscode.window.tabGroups.all.map((tg) => tg.tabs).flat();
    const index = tabs.findIndex((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.path === file.path);
    if (index !== -1) {
      await vscode.window.tabGroups.close(tabs[index]);
    }
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean }
  ): Promise<void> {
    const decoder = new TextDecoder("utf-8");
    try {
      const contentJson = JSON.parse(decoder.decode(content));
      const isNotNew = this.docMap.has(uri.toString());
      this.docMap.set(uri.toString(), decoder.decode(content));

      if (isNotNew) {
        // User has updated the document
        setTimeout(async () => {
          await this.closeFileIfOpen(uri);
          this.insertIntoCosmosDb(uri, contentJson);
          vscode.window.showInformationMessage(localize("documentSaved", "Document successfully saved to Cosmos DB"));

          this.docMap.delete(uri.toString());
        }, 1000);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  private insertIntoCosmosDb(uri: vscode.Uri, contentJson: any): Promise<{ count: number; elapsedTimeMS: number }> {
    const { server, database, container } = this.getContainerInfo(uri);
    return this.nosqlService.insertDocuments(server, database, container, [contentJson]);
  }
  private getContainerInfo(uri: vscode.Uri): { server: string; database: string; container: string } {
    if (!uri.path.startsWith("/")) {
      throw new Error(localize("invalidPath", "Invalid path"));
    }

    const [server, database, container] = uri.path.slice(1).split("/");
    return { server, database, container };
  }

  delete(uri: vscode.Uri, options: { readonly recursive: boolean }): void | Thenable<void> {
    if (this.docMap.has(uri.toString())) {
      this.docMap.delete(uri.toString());
    }
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean }): void | Thenable<void> {
    if (!this.docMap.has(oldUri.toString()) && !options.overwrite) {
      return;
    }

    this.docMap.set(newUri.toString(), this.docMap.get(oldUri.toString())!);
    this.docMap.delete(oldUri.toString());
  }

  copy?(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean }): void | Thenable<void> {
    throw new Error(localize("notImplemented", "Method copy not implemented"));
  }
}
