export interface MongoQuery {
  query: string;
  offset?: number;
  limit?: number;
}

/**
 * query-editor --> Webview
 */
export type QuerEditorCommand =
  | {
      action: "ready";
    }
  | {
      action: "submitQuery";
      query: MongoQuery;
    };

export interface QueryResult {
  documents: any[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Webview --> query-editor
 */
export type QueryEditorMessage =
  | {
      type: "initialize";
      data: {
        connectionId: string;
        databaseName: string;
        collectionName: string;
      };
    }
  | {
      type: "queryResult";
      data: QueryResult;
    };
