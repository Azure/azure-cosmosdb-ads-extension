import * as azdata from 'azdata';
import * as vscode from 'vscode';
import { AppContext } from '../appContext';
import { ProviderId } from './connectionProvider';

export class ObjectExplorerProvider implements azdata.ObjectExplorerProvider {
	constructor(private appContext: AppContext) {}
	
	// maintain sessions

	onSessionCreatedEmitter: vscode.EventEmitter<azdata.ObjectExplorerSession> = new vscode.EventEmitter<azdata.ObjectExplorerSession>();
	onSessionCreated: vscode.Event<azdata.ObjectExplorerSession> = this.onSessionCreatedEmitter.event;

	onSessionDisconnectedEmitter: vscode.EventEmitter<azdata.ObjectExplorerSession> = new vscode.EventEmitter<azdata.ObjectExplorerSession>();
	onSessionDisconnected: vscode.Event<azdata.ObjectExplorerSession> = this.onSessionDisconnectedEmitter.event;

	onExpandCompletedEmitter: vscode.EventEmitter<azdata.ObjectExplorerExpandInfo> = new vscode.EventEmitter<azdata.ObjectExplorerExpandInfo>();
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
					nodeType: 'server',
					label: '_not_used_',
					isLeaf: false
				}
			});
		}, 0);
		return Promise.resolve({
			sessionId
		});
	}
	closeSession(closeSessionInfo: azdata.ObjectExplorerCloseSessionInfo): Thenable<azdata.ObjectExplorerCloseSessionResponse> {
		console.log("ObjectExplorerProvider.closeSession");
		return Promise.resolve({
			sessionId: '1',
			success: true
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
		console.log(`ObjectExplorerProvider.expandNode ${nodeInfo.nodePath}`);
    // nodePath: server/database/collection/{Documents, Scale & Settings}
		if (!nodeInfo.nodePath) {
			throw new Error('nodeInfo.nodePath is undefined');
		}

		const pathComponents = nodeInfo.nodePath?.split('/');
		const slashCount = pathComponents.length - 1;

		switch(slashCount) {
			case 0: return this.expandAccount(nodeInfo, pathComponents[0]); // root node
			case 1: return this.expandDatabase(nodeInfo, pathComponents[1], pathComponents[0]); // database node
			case 2: return this.expandCollection(nodeInfo, pathComponents[2]); // collection node
			default:
					throw new Error(`Unrecognized path ${nodeInfo.nodePath}`);
		}
  }

	private expandAccount(nodeInfo: azdata.ExpandNodeInfo, server: string): Thenable<boolean> {
		// Get list of databases from root
		return this.appContext.listDatabases(server).then(databases => {
			this.onExpandCompletedEmitter.fire({
				sessionId: nodeInfo.sessionId,
				nodePath: nodeInfo.nodePath || 'unknown',
				nodes: databases.map(db => ({
					nodePath: `${nodeInfo?.nodePath}/${db.name}`,
					nodeType: 'Database',
					label: db.name || 'unknown',
					isLeaf: false,
				})),
			});
			return true;
		});
	}

	public expandDatabase(nodeInfo: azdata.ExpandNodeInfo, database: string, server: string): Thenable<boolean> {
    // Get list of collections from database
    if (!database) {
      return Promise.resolve(false);
    }
    return this.appContext.listCollections(server, database).then((collections) => {
      this.onExpandCompletedEmitter.fire({
        sessionId: nodeInfo.sessionId,
        nodePath: nodeInfo.nodePath || 'unknown',
        nodes: collections.map((coll) => ({
          nodePath: `${nodeInfo?.nodePath}/${coll.collectionName}`,
          nodeType: 'Queue',
          label: coll.collectionName || 'unknown',
          isLeaf: false,
        })),
      });
      return true;
    });
  }

	private expandCollection(nodeInfo: azdata.ExpandNodeInfo, collection: string): Thenable<boolean> {
		this.onExpandCompletedEmitter.fire({
			sessionId: nodeInfo.sessionId,
			nodePath: nodeInfo.nodePath || 'unknown',
			nodes: [
				{
					nodePath: `${nodeInfo?.nodePath}/documents`,
          nodeType: 'Assembly',
          label: 'Documents',
          isLeaf: true,
				},
				{
					nodePath: `${nodeInfo?.nodePath}/scale_and_settings`,
          nodeType: 'Service',
          label: 'Scale & Settings',
          isLeaf: true,
				}
			],
		});
		return Promise.resolve(true);
	}

	refreshNode(nodeInfo: azdata.ExpandNodeInfo): Thenable<boolean> {
		console.log("ObjectExplorerProvider.refreshNode");
		return Promise.resolve(true);
	}
	findNodes(findNodesInfo: azdata.FindNodesInfo): Thenable<azdata.ObjectExplorerFindNodesResponse> {
		console.log("ObjectExplorerProvider.findNodes");
		throw new Error('Method not implemented.');
	}
	registerOnExpandCompleted(handler: (response: azdata.ObjectExplorerExpandInfo) => any): void {
		console.log("ObjectExplorerProvider.registerOnExpandCompleted");
		this.onExpandCompleted((e) => {
			handler(e);
		});
	}
	handle?: number;
	providerId: string = ProviderId;
}