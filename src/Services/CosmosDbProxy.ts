import * as nls from "vscode-nls";
import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node";
import { hideStatusBarItem, showStatusBarItem } from "../appContext";
import { getErrorMessage } from "../util";
const localize = nls.loadMessageBundle();

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
        cancelationTokenId?: number;
      };
    }
  | {
      command: "CancelToken";
      payload: {
        cancelationTokenId: number;
      };
    }
  | {
      command: "ListDatabases" | "Shutdown" | "GenerateCancelationToken";
      payload?: undefined;
    };

/**
 * Response from Cosmos DB noSQL proxy
 */
interface QueryResponseMessage {
  documents: unknown[];
  continuationToken: string | undefined;
  maxCount: number | undefined;
  requestCharge: number | undefined;
  count: number | undefined;
}

export class CosmosDbProxy {
  private static readonly EXECUTABLE_PATH = "dotnet";
  // dirname is the "dist/" folder
  private static readonly DOTNET_DLL_PATH = `${__dirname}/../CosmosDbProxy/CosmosDbProxy/bin/Release/net6.0/publish/CosmosDbProxy.dll`;

  private _childProcess: cp.ChildProcess | undefined;
  private _rpcConnection: rpc.MessageConnection | undefined;

  public constructor(private _server: string, private _connectionString: string) {}

  /**
   * Launch proxy if not running already
   */
  private bringUpProxy(): Promise<cp.ChildProcess> {
    return new Promise((resolve, reject) => {
      showStatusBarItem(localize("startingProxy", "Starting proxy for {0}...", this._server));
      // Spawn the executable if you need to attach to the process to debug
      // this._childProcess = cp.spawn(`${__dirname}/../CosmosDbProxy/CosmosDbProxy/bin/Debug/net6.0/CosmosDbProxy.exe`, {
      this._childProcess = cp.spawn(CosmosDbProxy.EXECUTABLE_PATH, ["exec", CosmosDbProxy.DOTNET_DLL_PATH], {
        shell: false,
      });
      hideStatusBarItem();
      if (
        !this._childProcess ||
        !this._childProcess.stdout ||
        !this._childProcess.stderr ||
        !this._childProcess.stdin
      ) {
        const message = localize(
          "errorStartingCosmosDbProxy",
          "Error starting Cosmos DB NoSQL proxy: {0}",
          CosmosDbProxy.EXECUTABLE_PATH
        );
        console.error(message);
        reject(message);
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
        return Promise.reject(localize("errorStartingProxy", "Error starting proxy for {0}...", this._server));
      }

      try {
        showStatusBarItem(localize("initalizingProxy", "Initializing proxy..."));
        const response = await this._rpcConnection?.sendRequest("Initialize", {
          ConnectionString: this._connectionString,
        });
        console.log("response", response);
      } catch (err) {
        return Promise.reject(
          localize("errorInitializingNoSqlProxy", "Error initializing Cosmos DB NoSQL proxy: {0}", getErrorMessage(err))
        );
      } finally {
        hideStatusBarItem();
      }
    }

    return await this.sendMessage(request);
  }

  private async sendMessage(message: CosmosDbProxyRequest): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (this._childProcess) {
        try {
          const result = await this._rpcConnection?.sendRequest(message.command, message.payload);
          return resolve(result);
        } catch (err) {
          return reject(err);
        }
      }

      return reject(localize("errorSendingMessageToProxy", "Error sending message to proxy"));
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
    maxCount: number,
    cancelationTokenId?: number
  ): Promise<QueryResponseMessage> {
    return await this.sendRequest({
      command: "ExecuteQuery",
      payload: {
        databaseId,
        containerId,
        queryText,
        continuationToken,
        maxCount,
        cancelationTokenId,
      },
    });
  }

  public async generateCancelationToken(): Promise<number> {
    return await this.sendRequest({ command: "GenerateCancelationToken" });
  }

  public async cancelToken(cancelationTokenId: number): Promise<number> {
    return await this.sendRequest({ command: "CancelToken", payload: { cancelationTokenId } });
  }
}
