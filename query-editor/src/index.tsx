import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryEditor, QueryEditorProps, MongoQuery, QuerEditorCommand, QueryEditorMessage } from 'azure-cosmos-db-query-editor';

const vscode = (window as any).acquireVsCodeApi();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

const onSubmitQuery = (connectionId: string, query: MongoQuery): void => {
  console.log("onSubmitQuery", query);
  const message: QuerEditorCommand = {
    action: 'submitQuery',
    query
  };

  vscode.postMessage(message);
};

const onReady = (): void => {
  vscode.postMessage({
    action: 'ready'
  });
};

const Bootstrapper = (props: { onReady: () => void }) => {
  useEffect(() => props.onReady && props.onReady());
  return <>Not initialized yet</>;
}

const queryEditorProps: QueryEditorProps = {
  connectionId: "",
  databaseName: "",
  collectionName: "",
  onSubmitQuery
};

window.addEventListener('message', event => {
  const message: QueryEditorMessage = event.data; // The JSON data our extension sent
  // console.log('Webview received', message);

  switch (message.type) {
    case "initialize":
      queryEditorProps.connectionId = JSON.stringify(message.data);
      queryEditorProps.databaseName = message.data.databaseName;
      queryEditorProps.collectionName = message.data.collectionName;
      break;
    case "queryResult":
      queryEditorProps.queryResult = message.data;
      break;
    default:
      // console.log("Unknown type", message);
      return;
  }

  root.render(
    <React.StrictMode>
      <QueryEditor {...queryEditorProps} />
    </React.StrictMode>
  );
});

root.render(
  <React.StrictMode>
    <Bootstrapper onReady={onReady} />
  </React.StrictMode>
);
