import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App, { AppProps } from './App';
import { MongoQuery, QuerEditorCommand, QueryEditorMessage } from "../../src/QueryClient/messageContract"

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

const appProps: AppProps = {
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
      appProps.connectionId = JSON.stringify(message.data);
      appProps.databaseName = message.data.databaseName;
      appProps.collectionName = message.data.collectionName;
      break;
    case "queryResult":
      appProps.queryResult = message.data;
      break;
    default:
      // console.log("Unknown type", message);
      return;
  }

  root.render(
    <React.StrictMode>
      <App {...appProps} />
    </React.StrictMode>
  );
});

root.render(
  <React.StrictMode>
    <Bootstrapper onReady={onReady} />
  </React.StrictMode>
);
