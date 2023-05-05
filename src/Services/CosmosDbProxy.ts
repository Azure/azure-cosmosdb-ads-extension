import * as cp from "child_process";

export type CosmosDbProxyRequest =
  | {
      command: "initialize";
      requestId?: string;
      payload: {
        connectionString: string;
      };
    }
  | {
      command: "executeQuery";
      requestId?: string;
      payload: {
        databaseId: string;
        containerId: string;
        queryText: string;
        continuationToken: string | undefined;
        maxCount: number | undefined;
      };
    }
  | {
      command: "listDatabases" | "shutdown";
      requestId?: string;
    };

interface CosmosDbProxyResponse {
  command: "queryResult" | "databases" | "completed";
  requestId: string;
}

export class CosmosDbProxy {
  private static readonly EXECUTABLE_PATH = "dotnet";
  // dirname is the "dist/" folder
  private static readonly DOTNET_DLL_PATH = `${__dirname}/../CosmosDbProxy/CosmosDbProxy/bin/Debug/net6.0/CosmosDbProxy.dll`;

  private _childProcess: cp.ChildProcess | undefined;
  private _requestIdCounter = 0;
  private _pendingRequests = new Map<string, (value: any) => void>();

  public constructor(private _connectionString: string) {}

  /**
   * Launch proxy if not running already
   */
  private bringUpProxy(): cp.ChildProcess | undefined {
    this._childProcess = cp.spawn(CosmosDbProxy.EXECUTABLE_PATH, ["exec", CosmosDbProxy.DOTNET_DLL_PATH], {
      shell: true,
    });

    if (!this._childProcess || !this._childProcess.stdout || !this._childProcess.stderr || !this._childProcess.stdin) {
      console.error("Error executing", CosmosDbProxy.EXECUTABLE_PATH);
      return;
    }

    console.log("Listening to stdout and stderr");

    this._childProcess.stdout.setEncoding("utf8");
    this._childProcess.stdout.on("data", (data: string) => {
      // Data coming from Proxy
      const shortData = data.length > 10 ? `${data.substring(0, 5)}..${data.slice(-5)}` : data;
      console.log(`ADS: new data from proxy (${data.length}): ${shortData}`);
      const response: CosmosDbProxyResponse = JSON.parse(data);

      if (this._pendingRequests.has(response.requestId)) {
        const resolve = this._pendingRequests.get(response.requestId);
        resolve!(response);
      }
    });

    this._childProcess.stderr.setEncoding("utf8");
    this._childProcess.stderr.on("data", (data) => {
      console.log("ADS: new data on stderr: " + data);

      data = data.toString();
    });

    this._childProcess.on("close", (code) => {
      console.log("ADS: closing code: " + code);
      this._childProcess = undefined;
    });

    this._childProcess.on("exit", (code) => {
      console.log("ADS: exiting code: " + code);
      this._childProcess = undefined;
    });

    console.log("proxy was started", this._childProcess);
    return this._childProcess;
  }

  private async sendRequest(request: CosmosDbProxyRequest): Promise<any> {
    // Make sure proxy is running
    if (!this._childProcess) {
      const runningProxy = this.bringUpProxy();
      if (!runningProxy) {
        return false;
      }

      // Initialize
      await this.sendMessage({
        command: "initialize",
        requestId: undefined,
        payload: {
          connectionString: this._connectionString,
        },
      });
    }

    return await this.sendMessage(request);
  }

  private async sendMessage(message: CosmosDbProxyRequest): Promise<any> {
    message.requestId = this.incrementRequestIdCounter().toString();
    if (this._childProcess) {
      // TODO check if stdin exists
      const result = this._childProcess.stdin!.write(JSON.stringify(message));

      if (result) {
        return await new Promise<void>((resolve, reject) => {
          // TODO remember reject as well
          this._pendingRequests.set(message.requestId!, resolve);
        });
      }
    }

    return Promise.reject("Error sending message to proxy");
  }

  /**
   * Only this method can increment requestId to make sure we don't end up with duplicate id's
   */
  private incrementRequestIdCounter(): number {
    return this._requestIdCounter++;
  }

  public dispose(): void {
    if (!this._childProcess) {
      return;
    }

    this.sendMessage({
      command: "shutdown",
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
      command: "executeQuery",
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
