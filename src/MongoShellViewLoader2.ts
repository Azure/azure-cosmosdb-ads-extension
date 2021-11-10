import * as vscode from "vscode";
import * as path from "path";
import * as child from "child_process";

interface IFromWebviewMessage {
  command: "execute";
  value: string;
}

interface IToWebviewMessage {
  command: "updateTerminal";
  value: string;
}

export default class MongoShellViewLoader2 {
  private readonly _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionPath: string;
  private _disposables: vscode.Disposable[] = [];
  private _childProcess: child.ChildProcess;

  constructor(extensionPath: string) {
    this._extensionPath = extensionPath;

    this._panel = vscode.window.createWebviewPanel("mongoshell", "Mongo Shell", vscode.ViewColumn.One, {
      enableScripts: true,
    });

    this._panel.webview.html = this.getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      (msg: IFromWebviewMessage) => {
        console.log("Received message from webview", msg);
        switch (msg.command) {
          case "execute":
            this._childProcess.stdin?.write(msg.value + `\n`);
            return;
        }
      },
      undefined,
      this._disposables
    );

    const args: string[] = [
      "--host",
      "languye-mongo.mongo.cosmos.azure.com",
      "--port",
      "10255",
      "--username",
      "languye-mongo",
      "--password",
      "",
      "--tls",
      "--tlsAllowInvalidCertificates",
    ];

    this._childProcess = child.execFile(path.join(this._extensionPath, "mongosh.exe"), args);
    this._childProcess.stdout?.on("data", (output: string) => {
      console.log(`Received from websocket [${output}]`);
      output.split("\n").forEach((line) => {
        if (line.endsWith("> ")) {
          line = `\x1B[1;0;32m${line}\x1B[0m`;
        }
        this._panel!.webview.postMessage({ command: "updateTerminal", value: line } as IToWebviewMessage);
      });
    });
  }

  private getWebviewContent(): string {
    // Get path to resource on disk
    const xtermjsScriptPath = vscode.Uri.file(
      path.join(this._extensionPath, "node_modules", "xterm", "lib", "xterm.js")
    );
    const xtermjsCssPath = vscode.Uri.file(path.join(this._extensionPath, "node_modules", "xterm", "css", "xterm.css"));

    // And get the special URI to use with the webview
    const xtermjsScript = this._panel!.webview.asWebviewUri(xtermjsScriptPath);
    const xtermjsCss = this._panel!.webview.asWebviewUri(xtermjsCssPath);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mongo Shell</title>

      <meta http-equiv="Content-Security-Policy"
                  content="connect-src *;
                            img-src https:;
                            script-src 'unsafe-eval' 'unsafe-inline' vscode-resource:;
                            style-src vscode-resource: 'unsafe-inline';">
      <link rel="stylesheet" href="${xtermjsCss}" />
      <script src="${xtermjsScript}"></script>
    </head>
    <body>
      <div id="terminal"></div>

      <script>
        const vscode = acquireVsCodeApi();
        let currentLine = "";
        const term = new Terminal();
        term.open(document.getElementById('terminal'));
        term.resize(120, 40);

        term.onKey(keyEvent => {
          console.log(keyEvent);
          if (keyEvent.domEvent.which === 13) {
            vscode.postMessage({
              command: 'execute',
              value: currentLine
            });
            currentLine = "";
          } else if (keyEvent.domEvent.which === 8) {
            if (currentLine) {
              currentLine = currentLine.slice(0, currentLine.length -1);
              term.write("\\b \\b");
            }
          } else {
            currentLine += keyEvent.key;
            term.write(keyEvent.key);
          }
        });

        window.addEventListener('message', event => {
          const message = event.data; // The JSON data our extension sent
          switch (message.command) {
            case 'updateTerminal':
              const text = message.value;
              term.writeln("");
              term.write(text);
              break;
          }
        });

    </script>
    </body>
    </html>`;
  }
}
