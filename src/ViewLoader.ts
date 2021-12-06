import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as nls from "vscode-nls";

const localize = nls.loadMessageBundle();
export default class ViewLoader {
  private readonly _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionPath: string;
  private _disposables: vscode.Disposable[] = [];

  constructor(extensionPath: string) {
    this._extensionPath = extensionPath;

    this._panel = vscode.window.createWebviewPanel("cosmosDbQuery", localize("query", "Query"), vscode.ViewColumn.One, {
      enableScripts: true,

      // localResourceRoots: [
      // 	vscode.Uri.file(path.join(extensionPath, "index.cde5ef"))
      // ]
    });

    this._panel.webview.html = this.getWebviewContent();

    // this._panel.webview.onDidReceiveMessage(
    //   (command: ICommand) => {
    //     switch (command.action) {
    //       case CommandAction.Save:
    //         this.saveFileContent(fileUri, command.content);
    //         return;
    //     }
    //   },
    //   undefined,
    //   this._disposables
    // );
  }

  private getWebviewContent(): string {
    const site = "https://localhost:5001/notebookClient/dist/index.html";
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Open Query</title>

        <meta http-equiv="Content-Security-Policy"
                    content="
														 connect-src *;
                             img-src https:;
                             script-src 'unsafe-eval' 'unsafe-inline' vscode-resource:;
                             style-src vscode-resource: 'unsafe-inline';">
    </head>
    <body>
      <iframe
        title="nbclient"
        width="300"
        height="200"
        src="${site}">
      </iframe>
    </body>
    </html>`;
  }

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
