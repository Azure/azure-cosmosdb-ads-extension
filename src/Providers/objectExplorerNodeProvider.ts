import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { Telemetry } from "../constant";
import { MongoProviderId, NoSqlProviderId } from "./connectionProvider";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { MongoService } from "../Services/MongoService";
import { CosmosDbNoSqlService } from "../Services/CosmosDbNoSqlService";
import { AbstractBackendService } from "../Services/AbstractBackendService";

const localize = nls.loadMessageBundle();
/**
 * Utilities to construct nodePath from server, database or collection nsmrd or extract the names from nodepath
 * nodePath naming convention: server/database/collection/{Documents, Scale & Settings}
 */

export const getNodeInfo = (
  nodePath: string
): { serverName: string; databaseName?: string; containerName?: string } => {
  const pathComponents = nodePath?.split("/");
  const slashCount = pathComponents.length - 1;

  switch (slashCount) {
    case 0:
      return { serverName: pathComponents[0] }; // root node
    case 1:
      return { serverName: pathComponents[0], databaseName: pathComponents[1] }; // database node
    case 2:
      return { serverName: pathComponents[0], databaseName: pathComponents[1], containerName: pathComponents[2] }; // collection node
    default:
      throw new Error(localize("unrecognizedPath", "Unrecognized path {0}", nodePath));
  }
};

export const createNodePath = (serverName: string, databaseName?: string, collectionName?: string): string => {
  let nodePath = serverName;
  if (databaseName !== undefined) {
    nodePath += `/${databaseName}`;
    if (collectionName !== undefined) {
      nodePath += `/${collectionName}`;
    }
  }

  return nodePath;
};

abstract class ObjectExplorerProviderBase implements azdata.ObjectExplorerProvider {
  constructor(
    protected context: vscode.ExtensionContext,
    protected reporter: TelemetryReporter,
    public providerId: string,
    protected backendService: AbstractBackendService
  ) {}

  // maintain sessions

  onSessionCreatedEmitter: vscode.EventEmitter<azdata.ObjectExplorerSession> =
    new vscode.EventEmitter<azdata.ObjectExplorerSession>();
  onSessionCreated: vscode.Event<azdata.ObjectExplorerSession> = this.onSessionCreatedEmitter.event;

  onSessionDisconnectedEmitter: vscode.EventEmitter<azdata.ObjectExplorerSession> =
    new vscode.EventEmitter<azdata.ObjectExplorerSession>();
  onSessionDisconnected: vscode.Event<azdata.ObjectExplorerSession> = this.onSessionDisconnectedEmitter.event;

  onExpandCompletedEmitter: vscode.EventEmitter<azdata.ObjectExplorerExpandInfo> =
    new vscode.EventEmitter<azdata.ObjectExplorerExpandInfo>();
  onExpandCompleted: vscode.Event<azdata.ObjectExplorerExpandInfo> = this.onExpandCompletedEmitter.event;

  createNewSession(connectionInfo: azdata.ConnectionInfo): Thenable<azdata.ObjectExplorerSessionResponse> {
    console.log("ObjectExplorerProvider.createNewSession", connectionInfo);

    // For now, sessionId is simply server
    const server = connectionInfo.options[AppContext.CONNECTION_INFO_KEY_PROP];
    const sessionId = server;

    setTimeout(() => {
      this.onSessionCreatedEmitter.fire({
        sessionId,
        success: true,
        rootNode: {
          nodePath: server,
          nodeType: "server",
          label: "_not_used_",
          isLeaf: false,
        },
      });
    }, 0);
    return Promise.resolve({
      sessionId,
    });
  }
  closeSession(
    closeSessionInfo: azdata.ObjectExplorerCloseSessionInfo
  ): Thenable<azdata.ObjectExplorerCloseSessionResponse> {
    console.log("ObjectExplorerProvider.closeSession");
    return Promise.resolve({
      sessionId: "1",
      success: true,
    });
  }
  registerOnSessionCreated(handler: (response: azdata.ObjectExplorerSession) => any): void {
    console.log("ObjectExplorerProvider.registerOnSessionCreated");
    this.onSessionCreated((e) => {
      handler(e);
    });
  }
  registerOnSessionDisconnected?(handler: (response: azdata.ObjectExplorerSession) => any): void {
    console.log("ObjectExplorerProvider.registerOnSessionDisconnected");
    this.onSessionDisconnected((e) => {
      handler(e);
    });
  }
  expandNode(nodeInfo: azdata.ExpandNodeInfo): Thenable<boolean> {
    console.log(`ObjectExplorerProvider.expandNode ${nodeInfo.nodePath} ${nodeInfo.sessionId}`);
    return this.executeExpandNode(nodeInfo);
  }

  private executeExpandNode(azNodeInfo: azdata.ExpandNodeInfo): Thenable<boolean> {
    if (!azNodeInfo.nodePath) {
      throw new Error("nodeInfo.nodePath is undefined");
    }

    const nodeInfo = getNodeInfo(azNodeInfo.nodePath);

    if (nodeInfo.containerName !== undefined) {
      return this.expandCollection(azNodeInfo); // collection node
    } else if (nodeInfo.databaseName !== undefined) {
      return this.expandDatabase(azNodeInfo, nodeInfo.databaseName, nodeInfo.serverName); // database node
    } else {
      return this.expandAccount(azNodeInfo, nodeInfo.serverName); // root node
    }
  }

  public expandAccount(nodeInfo: azdata.ExpandNodeInfo, server: string): Promise<boolean> {
    this.reporter.sendActionEvent(
      Telemetry.sources.objectExplorerNodeProvider,
      Telemetry.actions.expand,
      Telemetry.targets.objectExplorerNodeProvider.accountNode
    );

    // Get list of databases from root
    return this.backendService.listDatabases(server).then((databases) => {
      this.onExpandCompletedEmitter.fire({
        sessionId: nodeInfo.sessionId,
        nodePath: nodeInfo.nodePath || "unknown",
        nodes: databases.map((db) => ({
          nodePath: `${nodeInfo?.nodePath}/${db.name}`,
          nodeType: "CosmosDbDatabase",
          icon: {
            light: this.context.asAbsolutePath("resources/light/database.svg"),
            dark: this.context.asAbsolutePath("resources/dark/database-inverse.svg"),
          },
          label: db.name || localize("unknown", "Unknown"),
          isLeaf: false,
        })),
      });
      return true;
    });
  }

  public abstract expandDatabase(nodeInfo: azdata.ExpandNodeInfo, database: string, server: string): Thenable<boolean>;

  private expandCollection(nodeInfo: azdata.ExpandNodeInfo): Thenable<boolean> {
    this.reporter.sendActionEvent(
      Telemetry.sources.objectExplorerNodeProvider,
      Telemetry.actions.expand,
      Telemetry.targets.objectExplorerNodeProvider.collectionNode
    );

    this.onExpandCompletedEmitter.fire({
      sessionId: nodeInfo.sessionId,
      nodePath: nodeInfo.nodePath || "unknown",
      nodes: [
        {
          nodePath: `${nodeInfo?.nodePath}/documents`,
          nodeType: "Assembly",
          icon: {
            light: this.context.asAbsolutePath("resources/light/document.svg"),
            dark: this.context.asAbsolutePath("resources/dark/document-inverse.svg"),
          },
          label: localize("documents", "Documents"),
          isLeaf: true,
        },
        {
          nodePath: `${nodeInfo?.nodePath}/scale_and_settings`,
          nodeType: "Service",
          label: localize("scaleAndSettings", "Scale & Settings"),
          isLeaf: true,
          icon: {
            light: this.context.asAbsolutePath("resources/light/scale.svg"),
            dark: this.context.asAbsolutePath("resources/dark/scale-inverse.svg"),
          },
        },
      ],
    });
    return Promise.resolve(true);
  }

  refreshNode(nodeInfo: azdata.ExpandNodeInfo): Thenable<boolean> {
    console.log("ObjectExplorerProvider.refreshNode");
    return this.executeExpandNode(nodeInfo);
  }
  findNodes(findNodesInfo: azdata.FindNodesInfo): Thenable<azdata.ObjectExplorerFindNodesResponse> {
    console.log("ObjectExplorerProvider.findNodes");
    throw new Error("Method not implemented.");
  }
  registerOnExpandCompleted(handler: (response: azdata.ObjectExplorerExpandInfo) => any): void {
    console.log("ObjectExplorerProvider.registerOnExpandCompleted");
    this.onExpandCompleted((e) => {
      handler(e);
    });
  }
  handle?: number;

  public async updateNode(connectionId: string, nodePath?: string): Promise<void> {
    const node1 = await azdata.objectexplorer.getNode(connectionId, nodePath);
    if (node1) {
      await node1.refresh();
    } else {
      console.error(`updateNode: node not found. ConnectionId:${connectionId} nodePath:${nodePath}`);
    }
  }
}

export class MongoObjectExplorerProvider extends ObjectExplorerProviderBase {
  constructor(context: vscode.ExtensionContext, reporter: TelemetryReporter, private nativeMongoService: MongoService) {
    super(context, reporter, MongoProviderId, nativeMongoService);
  }

  public expandDatabase(nodeInfo: azdata.ExpandNodeInfo, database: string, server: string): Thenable<boolean> {
    // Get list of collections from database
    if (!database) {
      return Promise.resolve(false);
    }

    this.reporter.sendActionEvent(
      Telemetry.sources.objectExplorerNodeProvider,
      Telemetry.actions.expand,
      Telemetry.targets.objectExplorerNodeProvider.databaseNode
    );

    return this.nativeMongoService.listCollections(server, database).then((collections) => {
      console.log("expandDatabase done");
      this.onExpandCompletedEmitter.fire({
        sessionId: nodeInfo.sessionId,
        nodePath: nodeInfo.nodePath || "unknown",
        nodes: collections.map((collection) => ({
          nodePath: `${nodeInfo?.nodePath}/${collection.collectionName}`,
          nodeType: "Queue",
          icon: {
            light: this.context.asAbsolutePath("resources/light/collection.svg"),
            dark: this.context.asAbsolutePath("resources/dark/collection-inverse.svg"),
          },
          label: collection.collectionName || localize("unknown", "Unknown"),
          isLeaf: true, // false, TODO: enable collection subnodes when support is implemented
        })),
      });
      return true;
    });
  }
}

export class NoSqlObjectExplorerProvider extends ObjectExplorerProviderBase {
  constructor(
    context: vscode.ExtensionContext,
    reporter: TelemetryReporter,
    private cosmosDbNoSqlService: CosmosDbNoSqlService
  ) {
    super(context, reporter, NoSqlProviderId, cosmosDbNoSqlService);
  }

  public expandDatabase(nodeInfo: azdata.ExpandNodeInfo, database: string, server: string): Thenable<boolean> {
    // Get list of collections from database
    if (!database) {
      return Promise.resolve(false);
    }

    this.reporter.sendActionEvent(
      Telemetry.sources.objectExplorerNodeProvider,
      Telemetry.actions.expand,
      Telemetry.targets.objectExplorerNodeProvider.databaseNode
    );

    return this.cosmosDbNoSqlService.listContainers(server, database).then((containers) => {
      console.log("expandDatabase done");
      this.onExpandCompletedEmitter.fire({
        sessionId: nodeInfo.sessionId,
        nodePath: nodeInfo.nodePath || "unknown",
        nodes: containers.map((container) => ({
          nodePath: `${nodeInfo?.nodePath}/${container.id}`,
          nodeType: "Queue",
          icon: {
            light: this.context.asAbsolutePath("resources/light/collection.svg"),
            dark: this.context.asAbsolutePath("resources/dark/collection-inverse.svg"),
          },
          label: container.id || localize("unknown", "Unknown"),
          isLeaf: true, // false, TODO: enable collection subnodes when support is implemented
        })),
      });
      return true;
    });
  }
}
