import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryEditor, QueryEditorProps, UserQuery } from '@azure/cosmos-query-editor-react';
import { QueryEditorCommand, QueryEditorMessage } from '../../src/QueryClient/messageContract';

const vscode = (window as any).acquireVsCodeApi();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

const onSubmitQuery = (connectionId: string, query: UserQuery): void => {
  console.log("onSubmitQuery", query);
  const message: QueryEditorCommand = {
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
	defaultQueryText: "{ }",
	paginationType: "offset",
  queryInputLabel: "Enter filter",
  queryButtonLabel: "Find",
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
			queryEditorProps.paginationType = message.data.paginationTpe;
			queryEditorProps.defaultQueryText = message.data.defaultQueryText;
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
