/**
 * query-editor --> Webview
 */
export type QuerEditorCommand = {
  action: "ready";
} | {
  action: "submitQuery";
  query: string;
};

/**
 * Webview --> query-editor
 */
export type QueryEditorMessage = {
  type: "initialize";
  data: {
    connectionId: string;
    databaseName: string;
    collectionName: string;
  }
} | {
  type: "queryResult";
  data: {
    queryResult: any;
    // TODO Add flag to indicate whether results have been clipped
  }
};
