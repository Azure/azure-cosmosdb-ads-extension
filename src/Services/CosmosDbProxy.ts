import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node";

export type CosmosDbProxyRequest =
  | {
      command: "Initialize";
      payload: {
        connectionString: string;
      };
    }
  | {
      command: "ExecuteQuery";
      payload: {
        databaseId: string;
        containerId: string;
        queryText: string;
        continuationToken: string | undefined;
        maxCount: number | undefined;
      };
    }
  | {
      command: "ListDatabases" | "Shutdown";
      payload?: undefined;
    };

export class CosmosDbProxy {
  private static readonly EXECUTABLE_PATH = "dotnet";
  // dirname is the "dist/" folder
  private static readonly DOTNET_DLL_PATH = `${__dirname}/../CosmosDbProxy/CosmosDbProxy/bin/Release/net6.0/publish/CosmosDbProxy.dll`;

  private _childProcess: cp.ChildProcess | undefined;
  private _rpcConnection: rpc.MessageConnection | undefined;

  public constructor(private _connectionString: string) {}

  /**
   * Launch proxy if not running already
   */
  private bringUpProxy(): Promise<cp.ChildProcess> {
    return new Promise((resolve, reject) => {
      // Spawn the executable if you need to attach to the process to debug
      // this._childProcess = cp.spawn(`${__dirname}/../CosmosDbProxy/CosmosDbProxy/bin/Debug/net6.0/CosmosDbProxy.exe`, {
      this._childProcess = cp.spawn(CosmosDbProxy.EXECUTABLE_PATH, ["exec", CosmosDbProxy.DOTNET_DLL_PATH], {
        shell: false,
      });

      if (
        !this._childProcess ||
        !this._childProcess.stdout ||
        !this._childProcess.stderr ||
        !this._childProcess.stdin
      ) {
        console.error("Error executing", CosmosDbProxy.EXECUTABLE_PATH);
        reject("Error executing " + CosmosDbProxy.EXECUTABLE_PATH);
        return;
      }

      this._rpcConnection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(this._childProcess.stdout),
        new rpc.StreamMessageWriter(this._childProcess.stdin)
      );

      this._rpcConnection.listen();

      this._rpcConnection.onError((error) => {
        // TODO handle error
        console.error("RPC error", error);
      });

      this._rpcConnection.onClose(() => {
        console.log("RPC connection closed");
        this._rpcConnection = undefined;
        this.dispose();
      });

      this._childProcess.on("close", (code) => {
        console.log("Proxy process closed with code: " + code);
        this._childProcess = undefined;
      });

      this._childProcess.on("exit", (code) => {
        console.log("ADS: exiting code: " + code);
        this._childProcess = undefined;
      });

      console.log("proxy was started", this._childProcess);
      resolve(this._childProcess);
    });
  }

  private async sendRequest(request: CosmosDbProxyRequest): Promise<any> {
    // Make sure proxy is running
    if (!this._childProcess) {
      const runningProxy = await this.bringUpProxy();
      if (!runningProxy) {
        return Promise.reject("Error starting proxy");
      }

      try {
        const response = await this._rpcConnection?.sendRequest("Initialize", {
          ConnectionString: this._connectionString,
        });
        console.log("response", response);
      } catch (err) {
        Promise.reject(`Error initializing proxy: ${err}`);
        return;
      }
    }

    return await this.sendMessage(request);
  }

  private async sendMessage(message: CosmosDbProxyRequest): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (this._childProcess) {
        const result = await this._rpcConnection?.sendRequest(message.command, message.payload);
        return resolve(result);
      }

      return reject("Error sending message to proxy");
    });
  }

  public dispose(): void {
    if (!this._childProcess) {
      return;
    }

    this.sendMessage({
      command: "Shutdown",
    });

    setTimeout(() => {
      if (this._childProcess?.connected) {
        this._childProcess.kill();
        this._childProcess = undefined;
      }
    }, 2000);
  }

  public async submitQuery(
    databaseId: string,
    containerId: string,
    queryText: string,
    continuationToken: string | undefined,
    maxCount: number
  ): Promise<any> {
    return await this.sendRequest({
      command: "ExecuteQuery",
      payload: {
        databaseId,
        containerId,
        queryText,
        continuationToken,
        maxCount,
      },
    });
  }
}
