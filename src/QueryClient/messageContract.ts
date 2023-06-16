export type ResultOffsetPagingInfo = {
  kind: "offset";
  total: number;
  offset: number;
  limit: number;
};

export type ResultInfinitePagingInfo = {
  kind: "infinite";
  continuationToken?: string;
  maxCount?: number;
};

export type QueryOffsetPagingInfo = {
  kind: "offset";
  limit?: number;
  offset?: number;
};

export type QueryInfinitePagingInfo = {
  kind: "infinite";
  continuationToken?: string;
  maxCount?: number;
};

export interface EditorUserQuery {
  query: string;
  pagingInfo: QueryOffsetPagingInfo | QueryInfinitePagingInfo;
}

export interface EditorQueryResult {
  documents: unknown[];
  pagingInfo?: ResultOffsetPagingInfo | ResultInfinitePagingInfo;
  requestCharge?: number;
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
        containerName: string;
        pagingType: "offset" | "infinite";
        defaultQueryText?: string;
      };
    }
  | {
      type: "queryResult";
      data: EditorQueryResult;
    };
