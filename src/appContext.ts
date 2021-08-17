import { Collection, MongoClient, MongoClientOptions } from 'mongodb';
import * as vscode from 'vscode';
import * as azdata from 'azdata';
import { ProviderId } from './Providers/connectionProvider';
import { CosmosClient, DatabaseResponse } from '@azure/cosmos';

export interface IDatabaseInfo {
	name?: string;
	empty?: boolean;
}

type ConnectionPick = azdata.connection.ConnectionProfile & vscode.QuickPickItem;
export interface ConnectionInfo {
  connectionId: string;
  serverName: string;
}

/**
 * Global context for app
 */
export class AppContext {
  public static readonly CONNECTION_INFO_KEY_PROP = 'server'; // Unique key to store connection info against
  private _mongoClients = new Map<string, MongoClient>();

  public async connect(server: string, connectionString: string): Promise<MongoClient | undefined> {
    const options: MongoClientOptions = <MongoClientOptions>{};
    try {
      const mongoClient = await MongoClient.connect(connectionString, options);
      this._mongoClients.set(server, mongoClient);
      return mongoClient;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  public async listDatabases(server: string): Promise<IDatabaseInfo[]> {
    if (!this._mongoClients.has(server)) {
      return [];
    }
    // https://mongodb.github.io/node-mongodb-native/3.1/api/index.html
    const result: { databases: IDatabaseInfo[] } = await this._mongoClients.get(server)!.db('test' /*testDb*/).admin().listDatabases();
    return result.databases;
  }

  public async listCollections(server: string, databaseName: string): Promise<Collection[]> {
    if (!this._mongoClients.has(server)) {
      return [];
    }
    return await this._mongoClients.get(server)!.db(databaseName).collections();
  }

  public async removeCollection(server: string, databaseName: string, collectionName: string): Promise<boolean> {
    if (!this._mongoClients.has(server)) {
      return false;
    }
    return await this._mongoClients.get(server)!.db(databaseName).dropCollection(collectionName);
  }

  private async _askUserForConnectionProfile(): Promise<ConnectionPick | undefined> {
    const connections = await azdata.connection.getConnections();
    const picks: ConnectionPick[] = connections.filter(c => c.providerId === ProviderId).map(c => ({
      ...c,
      label: c.connectionName
    }));

    return vscode.window.showQuickPick<ConnectionPick>(picks, {
      placeHolder: 'Select mongo account'
    });

  }

  public async createMongoDatabase(connectionInfo?: ConnectionInfo) {
    if (!connectionInfo) {
      const connectionProfile = await this._askUserForConnectionProfile();
      if (!connectionProfile) {
        // TODO Show error here
        return;
      }

      connectionInfo = {
        connectionId: connectionProfile.connectionId,
        serverName: connectionProfile.serverName
      }
    }

    const databaseName = await vscode.window.showInputBox({
      placeHolder: "Database",
      prompt: "Enter database name",
      // validateInput: validateMongoCollectionName,
      ignoreFocusOut: true,
    });

    const credentials = await azdata.connection.getCredentials(connectionInfo.connectionId);

    const server = connectionInfo.serverName;

    if (!server || !credentials || !credentials['password']) {
      throw new Error(`Missing serverName or connectionId ${server} ${credentials}`)
    }

    const connectionString = credentials['password'];

    // // TODO not working, connectionString doesn't have the right format
    // const client = new CosmosClient(connectionString);
    // const database: DatabaseResponse = await client.databases.create({ id: databaseName });
    // console.log(database);

    await this.connect(server, connectionString);
    console.log(await this.listDatabases(server));
  }

  public createMongoCollection(connectionInfo?: ConnectionInfo, databaseName?: string): Promise<Collection> {
    return new Promise(async (resolve, reject) => {
      if (!connectionInfo) {
        const connectionProfile = await this._askUserForConnectionProfile();
        if (!connectionProfile) {
          // TODO Show error here
          reject('Missing connectionProfile');
          return ;
        }
  
        connectionInfo = {
          connectionId: connectionProfile.connectionId,
          serverName: connectionProfile.serverName
        }
      }
  
      if (!databaseName) {
        databaseName = await vscode.window.showInputBox({
          placeHolder: "Database",
          prompt: "Enter database name",
          // validateInput: validateMongoCollectionName,
          ignoreFocusOut: true,
        });
      }
  
      const collectionName = await vscode.window.showInputBox({
        placeHolder: "Collection",
        prompt: "Enter collection name",
        // validateInput: validateMongoCollectionName,
        ignoreFocusOut: true,
      });
  
      if (!collectionName) {
        // TODO handle error
        reject('Collection cannot be undefined');
        return;
      }
      
      const credentials = await azdata.connection.getCredentials(connectionInfo.connectionId);
  
      const server = connectionInfo.serverName;
  
      if (!server || !credentials || !credentials['password']) {
        reject(`Missing serverName or connectionId ${server} ${credentials}`)
      }
  
      const connectionString = credentials['password'];
  
      const client = await this.connect(server, connectionString);
  
      if (client) {
        const collection = await client.db(databaseName).createCollection(collectionName);
        resolve(collection);
      } else {
        reject(`Could not connect to ${server}`);
      }
    });

  }

  public disconnect(server: string): Promise<void> {
    if (!this._mongoClients.has(server)) {
      return Promise.resolve();
    }

    const client = this._mongoClients.get(server);
    this._mongoClients.delete(server);
    return client!.close();
  }
}