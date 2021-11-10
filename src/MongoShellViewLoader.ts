import * as vscode from "vscode";
import * as SockJS from "sockjs-client";
import { WebSocket } from "ws";

interface IFromWebviewMessage {
  command: "execute";
  value: string;
}

interface IToWebviewMessage {
  command: "updateOutput";
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
        console.log('Received message from webview', msg);
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
      console.log(`Received from websocket ${webSocketMessage.data}`);
      this._panel!.webview.postMessage({ command: 'updateOutput', value: webSocketMessage.data } as IToWebviewMessage);
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
    </head>
    <body>
      <input id="input" />
      <button id="button1">Button1</button>
      <div id="result">Mongo Shell Output</div>

      <script>
        const vscode = acquireVsCodeApi();
        const resultElt = document.getElementById('result');
        const inputElt = document.getElementById('input');
        window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent
            switch (message.command) {
                case 'updateOutput':
                    const current = resultElt.innerHTML;
                    resultElt.innerHTML = current + '<br />' + message.value;
                    break;
            }
        });
        document.getElementById('button1').addEventListener('click', e => {
          vscode.postMessage({
            command: 'execute',
            value: inputElt.value
          });
        });
    </script>
    </body>
    </html>`;
  }
}
