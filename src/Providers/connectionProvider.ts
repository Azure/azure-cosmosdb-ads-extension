import * as azdata from 'azdata';
import * as vscode from 'vscode';
import { AppContext } from '../appContext';
import { CosmosDBManagementClient } from '@azure/arm-cosmosdb';
import { TokenCredentials } from '@azure/ms-rest-js';

export const ProviderId: string = 'COSMOSDB_MONGO';

export class ConnectionProvider implements azdata.ConnectionProvider {
	constructor(private appContext: AppContext) {}

	// Maintain current connections server <--> connectionUri
	private connectionUriToServerMap = new Map<string, string>();

  private onConnectionCompleteEmitter: vscode.EventEmitter<azdata.ConnectionInfoSummary> = new vscode.EventEmitter();
	onConnectionComplete: vscode.Event<azdata.ConnectionInfoSummary> = this.onConnectionCompleteEmitter.event;

	private onIntelliSenseCacheCompleteEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter();
	onIntelliSenseCacheComplete: vscode.Event<string> = this.onIntelliSenseCacheCompleteEmitter.event;

	private onConnectionChangedEmitter: vscode.EventEmitter<azdata.ChangedConnectionInfo> = new vscode.EventEmitter();
	onConnectionChanged: vscode.Event<azdata.ChangedConnectionInfo> = this.onConnectionChangedEmitter.event;

	async connect(connectionUri: string, connectionInfo: azdata.ConnectionInfo): Promise<boolean> {
		console.log(`ConnectionProvider.connect ${connectionUri}`);
		// For now, pass connection string in password
		console.log('connectionInfo', connectionInfo);

		let password = connectionInfo.options['password'];

		if (connectionInfo.options['authenticationType'] === 'AzureMFA') {
			try {
				password = await this._retrieveConnectionString(connectionInfo);
			} catch(e) {
				vscode.window.showErrorMessage((e as { message: string }).message);
				return Promise.resolve(false);
			}
		}

		if (!password) {
			return Promise.resolve(false);
		}

		const server = connectionInfo.options[AppContext.CONNECTION_INFO_KEY_PROP];
		this.connectionUriToServerMap.set(connectionUri, server);

		await this.appContext.connect(server, password);

		this.onConnectionCompleteEmitter.fire({
			connectionId: '123',
			ownerUri: connectionUri,
			messages: '',
			errorMessage: '',
			errorNumber: 0,
			connectionSummary: {
				serverName: '',
				userName: ''
			},
			serverInfo: {
				serverReleaseVersion: 1,
				engineEditionId: 1,
				serverVersion: '1.0',
				serverLevel: '',
				serverEdition: '',
				isCloud: true,
				azureVersion: 1,
				osVersion: '',
				options: {}
			}
		});
		return Promise.resolve(true);
	}
	disconnect(connectionUri: string): Promise<boolean> {
		console.log("ConnectionProvider.disconnect");
		if (!this.connectionUriToServerMap.has(connectionUri)) {
			return Promise.reject(`ConnectionUri unknown: ${connectionUri}`);
		}

		this.appContext.disconnect(this.connectionUriToServerMap.get(connectionUri)!);
		this.connectionUriToServerMap.delete(connectionUri);

		return Promise.resolve(true);
	}
	cancelConnect(connectionUri: string): Promise<boolean> {
		console.log("ConnectionProvider.cancelConnect");
		return Promise.resolve(true);
	}
	listDatabases(connectionUri: string): Promise<azdata.ListDatabasesResult> {
		console.log("ConnectionProvider.listDatabases");
		return Promise.resolve({
			databaseNames: ['master', 'msdb']
		});
	}
	changeDatabase(connectionUri: string, newDatabase: string): Promise<boolean> {
		console.log("ConnectionProvider.changeDatabase");
		return Promise.resolve(true);
	}
	rebuildIntelliSenseCache(connectionUri: string): Promise<void> {
		console.log("ConnectionProvider.rebuildIntelliSenseCache");
		return Promise.resolve();
	}
	getConnectionString(connectionUri: string, includePassword: boolean): Promise<string> {
		console.log("ConnectionProvider.getConnectionString");
		return Promise.resolve('conn_string');
	}
	buildConnectionInfo?(connectionString: string): Promise<azdata.ConnectionInfo> {
		console.log("ConnectionProvider.buildConnectionInfo");
		return Promise.resolve({
			options: []
		});
	}
	registerOnConnectionComplete(handler: (connSummary: azdata.ConnectionInfoSummary) => any): void {
		console.log("ConnectionProvider.registerOnConnectionComplete");
		this.onConnectionComplete((e) => {
			handler(e);
		});
	}
	registerOnIntelliSenseCacheComplete(handler: (connectionUri: string) => any): void {
		console.log('IntellisenseCache complete');
	}
	registerOnConnectionChanged(handler: (changedConnInfo: azdata.ChangedConnectionInfo) => any): void {
		console.log('Connection changed');
	}
	handle?: number;
	providerId: string = ProviderId;

	/**
	 * use cosmosdb-arm to retrive connection string
	 */
	private async _retrieveConnectionString(connectionInfo: azdata.ConnectionInfo): Promise<string> {
		const cosmosDbAccountName = connectionInfo.options['server'];
		const tenantId = connectionInfo.options['azureTenantId'];
		const accountId = connectionInfo.options['azureAccount'];

		// const token = connectionInfo.options['azureAccountToken'];

		// const tokens = await azdata.accounts.getSecurityToken({
		// 	key: {
		// 		providerId: '',
		// 		accountId: connectionInfo.options['azureAccount']
		// 	},
		// 	displayInfo: {
		// 		contextualDisplayName: '',
		// 		accountType: '',
		// 		displayName: '',
		// 		userId: ''
		// 	},
		// 	properties: {
		// 		tenants: [ tenantId ]
		// 	},
		// 	isStale: false
		// }, azdata.AzureResource.ResourceManagement);
		// const token = tokens[tenantId].token;
		// const tokenType = tokens[tenantId].tokenType;

		const accounts = (await azdata.accounts.getAllAccounts()).filter(a => a.key.accountId === accountId);
		if (accounts.length < 1) {
			throw new Error('No azure account found');
		}

		const azureToken = await azdata.accounts.getAccountSecurityToken(accounts[0], tenantId, azdata.AzureResource.ResourceManagement);

		if (!azureToken) {
			throw new Error('Unable to retrieve ARM token');
		}

		// TODO find a better way to retrieve this info
		const armEndpoint = "https://management.azure.com";

		const parsedAzureResourceId = connectionInfo.options['azureResourceId'].split('/');
		const subscriptionId = parsedAzureResourceId[2];
		const resourceGroup = parsedAzureResourceId[4];
		const client = createAzureClient(subscriptionId, new TokenCredentials(azureToken.token, azureToken.tokenType /* , 'Bearer' */), armEndpoint);

		const connectionStringsResponse = await client.databaseAccounts.listConnectionStrings(resourceGroup, cosmosDbAccountName);
		const connectionString = connectionStringsResponse.connectionStrings?.[0]?.connectionString;
		if (!connectionString) {
			throw new Error('Missing connection string');
		}
		return connectionString;
	}
}

const createAzureClient = (subscriptionId: string, credentials: any /*msRest.ServiceClientCredentials */, armEndpoint: string) => {
	return new CosmosDBManagementClient(credentials,
		subscriptionId,
		{ baseUri: armEndpoint }
	);
};
