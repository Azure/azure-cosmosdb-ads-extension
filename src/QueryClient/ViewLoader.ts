import * as vscode from "vscode";
import * as path from "path";
import { QueryEditorCommand, QueryEditorMessage, EditorUserQuery } from "./messageContract";

export interface ViewLoaderOptions {
  extensionPath: string;
  title: string;
  onReady: () => void;
  onQuerySubmit: (query: EditorUserQuery) => void;
  onDidDispose: () => void;
}

export default class ViewLoader {
  private readonly _panel: vscode.WebviewPanel | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor(public readonly options: ViewLoaderOptions) {
    this._panel = vscode.window.createWebviewPanel("cosmosDbQuery", this.options.title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true, // TODO use vscode getState, setState to save/restore react state
      // localResourceRoots: [
      // 	vscode.Uri.file(path.join(extensionPath, "index.cde5ef"))
      // ]
    });

    this._panel.webview.html = this.getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      (msg: QueryEditorCommand) => {
        console.log("onDidReceiveMessage", msg);
        switch (msg.action) {
          case "ready":
            this.options.onReady();
            return;
          case "submitQuery":
            this.options.onQuerySubmit(msg.query);
            return;
          default:
            console.error("Unrecognized message", JSON.stringify(msg));
        }
      },
      undefined,
      this._disposables
    );

    this._panel.onDidDispose(options.onDidDispose);
  }

  public dispose() {
    this._panel?.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  public sendCommand(command: QueryEditorMessage) {
    if (!this._panel) {
      console.error("panel not ready, yet");
      return;
    }

    this._panel!.webview.postMessage(command);
  }

  public reveal() {
    this._panel?.reveal();
  }

  private getWebviewContent() {
    const jsFile = "query-editor.js";
    const cssFile = "query-editor.css";
    const localServerUrl = "http://localhost:3000";

    let scriptUrl = null;
    let cssUrl = null;

    const isProduction = true;

    if (isProduction) {
      scriptUrl = this._panel?.webview
        .asWebviewUri(vscode.Uri.file(path.join(this.options.extensionPath, "query-editor", "build", jsFile)))
        .toString();
      cssUrl = this._panel?.webview
        .asWebviewUri(vscode.Uri.file(path.join(this.options.extensionPath, "query-editor", "build", cssFile)))
        .toString();
    } else {
      scriptUrl = `${localServerUrl}/${jsFile}`;
    }

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${isProduction ? `<link href="${cssUrl}" rel="stylesheet">` : ""}
    </head>
    <body>
      <div id="root"></div>
      <script src="${scriptUrl}" />
    </body>
    </html>`;
  }
}
