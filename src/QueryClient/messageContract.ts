export interface EditorUserQuery {
  query: string;
  offsetPagingInfo?: {
    limit?: number;
    offset?: number;
  };
  infinitePagingInfo?: {
    continuationToken?: string;
    maxCount?: number;
  };
}

export interface EditorQueryResult {
  // estlint-disable @typescript-eslint/no-explicit-any
  documents: any[];
  offsetPagingInfo?: {
    total: number;
    offset: number;
    limit: number;
  };
  infinitePagingInfo?: {
    continuationToken: string;
    maxCount?: number;
  };
}

/**
 * query-editor --> Webview
 */
export type QueryEditorCommand =
  | {
      action: "ready";
    }
  | {
      action: "submitQuery";
      query: EditorUserQuery;
    };

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
      data: EditorQueryResult;
    };
