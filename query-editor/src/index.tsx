import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { QuerEditorCommand, QueryEditorMessage } from "../../src/QueryClient/messageContract"

const vscode = (window as any).acquireVsCodeApi();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

const onSubmitQuery = (connectionId: string, query: string): void => {
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

let connectionId: string, collectionName: string, databaseName: string, queryResultJson: string;

window.addEventListener('message', event => {
  const message: QueryEditorMessage = event.data; // The JSON data our extension sent
	// console.log('Webview received', message);

  let mustRender = false;
  switch(message.type) {
    case "initialize":
      connectionId = JSON.stringify(message.data);
      databaseName = message.data.databaseName;
      collectionName = message.data.collectionName;
      mustRender = true;
      break;
    case "queryResult":
      queryResultJson = JSON.stringify(message.data.queryResult, null, "");
      mustRender = true;
      break;
    default:
      // console.log("Unknown type", message);
  }

  if (mustRender) {
    root.render(
      <React.StrictMode>
        <App
          connectionId={/* message.connectionId */ JSON.stringify(connectionId)}
          collectionName={collectionName}
          databaseName={databaseName}
          queryResultJson={ queryResultJson }
          onSubmitQuery={onSubmitQuery}
        />
      </React.StrictMode>
    );
  }
});

root.render(
  <React.StrictMode>
    <Bootstrapper onReady={onReady} />
  </React.StrictMode>
);
