import * as vscode from "vscode";
import "sockjs-client";
import * as path from "path";
import * as SockJS from "sockjs-client";
import { WebSocket } from "ws";

interface IFromWebviewMessage {
  command: "execute";
  value: string;
}

interface IToWebviewMessage {
  command: "updateTerminal";
  value: string;
}

export default class MongoShellViewLoader {
  private readonly _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionPath: string;
  private _disposables: vscode.Disposable[] = [];
  private _websocket: WebSocket | undefined;

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
            this._websocket && this._websocket.send(msg.value + `\n`);
            return;
        }
      },
      undefined,
      this._disposables
    );

    this.initialize();
  }

  public async initialize() {
    this._websocket = await this.connectToServer();
    this._websocket.onmessage = (webSocketMessage) => {
      let output = webSocketMessage.data as string;
      console.log(`Received from websocket [${output}]`);

      output
        .split("\n")
        .forEach((line) =>
          this._panel!.webview.postMessage({ command: "updateTerminal", value: line } as IToWebviewMessage)
        );
    };
  }

  private async connectToServer(): Promise<WebSocket> {
    const ws = new SockJS("http://localhost:7071/ws");
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (ws.readyState === 1) {
          clearInterval(timer);
          resolve(ws);
        }
      }, 10);
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
