import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as nls from "vscode-nls";
import { MongoQuery, QuerEditorCommand, QueryEditorMessage } from "./messageContract";

const localize = nls.loadMessageBundle();

export interface ViewLoaderOptions {
  extensionPath: string;
  title: string;
  onReady: () => void;
  onQuerySubmit: (query: MongoQuery) => void;
}

export default class ViewLoader {
  private readonly _panel: vscode.WebviewPanel | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _options: ViewLoaderOptions) {
    this._panel = vscode.window.createWebviewPanel("cosmosDbQuery", this._options.title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true, // TODO use vscode getState, setState to save/restore react state
      // localResourceRoots: [
      // 	vscode.Uri.file(path.join(extensionPath, "index.cde5ef"))
      // ]
    });

    this._panel.webview.html = this.getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      (msg: QuerEditorCommand) => {
        console.log("onDidReceiveMessage", msg);
        switch (msg.action) {
          case "ready":
            this._options.onReady();
            return;
          case "submitQuery":
            this._options.onQuerySubmit(msg.query);
            return;
          default:
            console.error("Unrecognized message", JSON.stringify(msg));
        }
      },
      undefined,
      this._disposables
    );
  }

  public sendCommand(command: QueryEditorMessage) {
    if (!this._panel) {
      console.error("panel not ready, yet");
      return;
    }

    this._panel!.webview.postMessage(command);
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
        .asWebviewUri(vscode.Uri.file(path.join(this._options.extensionPath, "out", jsFile)))
        .toString();
      cssUrl = this._panel?.webview
        .asWebviewUri(vscode.Uri.file(path.join(this._options.extensionPath, "out", cssFile)))
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

  // private getWebviewContent(): string {
  //   // const hostname = "https://localhost:5001";
  //   const hostname = "https://localhost:44329";
  //   const site = `${hostname}/notebookClient/dist/index.html`;

  //   return `<!DOCTYPE html>
  //   <html lang="en">
  //   <head>
  //       <meta charset="UTF-8">
  //       <meta name="viewport" content="width=device-width, initial-scale=1.0">
  //       <title>Open Query</title>

  //       <meta http-equiv="Content-Security-Policy"
  //                   content="
  // 													 connect-src *;
  //                            img-src https:;
  //                            script-src 'unsafe-eval' 'unsafe-inline' vscode-resource:;
  //                            style-src vscode-resource: 'unsafe-inline';">
  //   </head>
  //   <body>
  //     <iframe
  // 			id="nbclient"
  //       title="nbclient"
  //       width="300"
  //       height="200"
  //       src="${site}">
  //     </iframe>
  // 		<script>
  // 			const iframe = document.getElementById('nbclient');
  //       // Handle the message inside the webview
  //       window.addEventListener('message', event => {
  //           const message = event.data; // The JSON data our extension sent
  // 					console.log('Webview forwarding', message);
  // 					iframe.contentWindow.postMessage(message, '${hostname}');
  //       });

  // 			iframe.onload = function (){
  // 				const vscode = window.acquireVsCodeApi();
  // 				vscode.postMessage({
  // 					action: 'ready'
  // 				});
  // 			};
  //   </script>
  //   </body>
  //   </html>`;
  // }

  // TODO No iframe version
  // private getWebviewContent(): string {
  //   // Local path to main script run in the webview
  //   const reactAppPathOnDisk: vscode.Uri = vscode.Uri.file(
  //     path.join(this._extensionPath, "output", "wwwroot", "notebookClient", "dist", "index.js")
  //   );

  //   const reactAppUri = reactAppPathOnDisk.with({ scheme: "vscode-resource" });

  //   const configJson = { blah: 1234 };

  //   return `<!DOCTYPE html>
  //   <html lang="en">
  //   <head>
  //       <meta charset="UTF-8">
  //       <meta name="viewport" content="width=device-width, initial-scale=1.0">
  //       <title>Open Query</title>

  //       <meta http-equiv="Content-Security-Policy"
  //                   content="default-src 'none';
  //                            connect-src *;
  //                            img-src https:;
  //                            script-src 'unsafe-eval' 'unsafe-inline' vscode-resource:;
  //                            style-src vscode-resource: 'unsafe-inline';">

  //       <script>
  //         window.acquireVsCodeApi = acquireVsCodeApi;
  //         window.initialData = ${configJson};
  //       </script>
  //   </head>
  //   <body>
  //       <div id="content"></div>

  //       <script src="${reactAppUri}"></script>
  //   </body>
  //   </html>`;
  // }
}
