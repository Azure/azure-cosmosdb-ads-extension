import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryEditor, QueryEditorProps, UserQuery } from '@azure/cosmos-query-editor-react';
import { QueryEditorCommand, QueryEditorMessage } from '../../src/QueryClient/messageContract';
import { Button } from '@fluentui/react-components';
import { FluentProvider, teamsLightTheme } from '@fluentui/react-components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vscode = (window as any).acquireVsCodeApi();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

const onSubmitQuery = (_: string, query: UserQuery): void => {
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

const onCreateNewDocument = (): void => {
  vscode.postMessage({
    action: 'createNewDocument'
  });
};

// eslint-disable-next-line react-refresh/only-export-components
const Bootstrapper = (props: { onReady: () => void }) => {
  useEffect(() => props.onReady && props.onReady());
  return <>Not initialized yet</>;
}

const queryEditorProps: QueryEditorProps = {
  connectionId: "",
  databaseName: "",
  containerName: "",
	defaultQueryText: "{ }",
	pagingType: "offset",
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
      queryEditorProps.containerName = message.data.containerName;
			queryEditorProps.pagingType = message.data.pagingType;
			queryEditorProps.defaultQueryText = message.data.defaultQueryText;
      queryEditorProps.progress = undefined;
      break;
    case "queryResult":
      queryEditorProps.queryResult = message.data;
      queryEditorProps.progress = undefined;
      break;
    case "setProgress":
      queryEditorProps.progress = {
        spinner: message.data
      };
      break;
    default:
      // console.log("Unknown type", message);
      return;
  }

  root.render(
    <React.StrictMode>
      <FluentProvider theme={teamsLightTheme} style={{ height: "100%", overflow: "hidden" }}>
        <Button onClick={() => onCreateNewDocument() } style={{ position: 'absolute', right: 20, top: 5 }}>New Document</Button>
      <div style={{ paddingTop: 10 }}>
      <QueryEditor {...queryEditorProps} />
      </div>
      </FluentProvider>
    </React.StrictMode>
  );
});

root.render(
  <React.StrictMode>
    <Bootstrapper onReady={onReady} />
  </React.StrictMode>
);
