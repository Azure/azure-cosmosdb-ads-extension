import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryEditor, QueryEditorProps, UserQuery } from '@azure/cosmos-query-editor-react';
import { EditorUserQuery, QueryEditorCommand, QueryEditorMessage } from '../../src/QueryClient/messageContract';

// Mock vscode API
const vscode = {
  postMessage: (msg: {action: string, query?: EditorUserQuery}) => {
    console.log("mock posMessage:", msg);

    switch (msg.action) {
      case "ready":
        // Send initialization
        window.postMessage({
          type: "initialize",
          data: {
            connectionId: "connectionId",
            databaseName: "databaseName",
            collectionName: "collectionName"
          }
        });
        break;
      case "submitQuery":
        window.postMessage({
          type: "queryResult",
          data: {
            documents: [
              { "_id": "6331aaf57332db3caefd02e1", "id": "0012D555-C7DE-4C4B-B4A4-2E8A6B8E1161", "type": "customer", "customerId": "0012D555-C7DE-4C4B-B4A4-2E8A6B8E1161", "title": "", "firstName": "Franklin", "lastName": "Ye", "emailAddress": "franklin9@adventure-works.com", "phoneNumber": "1 (11) 500 555-0139", "creationDate": "2014-02-05T00:00:00", "addresses": [{ "addressLine1": "1796 Westbury Dr.", "addressLine2": "", "city": "Melton", "state": "VIC", "country": "AU", "zipCode": "3337" }], "password": { "hash": "GQF7qjEgMl3LUppoPfDDnPtHp1tXmhQBw0GboOjB8bk=", "salt": "12C0F5A5" }, "salesOrderCount": 2 },
              { "_id": "6331aaf57332db3caefd03ab", "id": "03FD4278-2C77-4FC4-93F1-20E0E58AD87A", "type": "customer", "customerId": "03FD4278-2C77-4FC4-93F1-20E0E58AD87A", "title": "", "firstName": "Franklin", "lastName": "Zheng", "emailAddress": "franklin17@adventure-works.com", "phoneNumber": "1 (11) 500 555-0147", "creationDate": "2013-03-23T00:00:00", "addresses": [{ "addressLine1": "5664 Wilke Drive", "addressLine2": "", "city": "Liverpool", "state": "ENG", "country": "GB", "zipCode": "L4 4HB" }], "password": { "hash": "ygObbPAiw6iVKKqlDlVhD9WvGD4jQ5ZltuvMKkjA62I=", "salt": "32325DA1" }, "salesOrderCount": 2 },
              { "_id": "6331aaf57332db3caefd0694", "id": "137B4594-90AC-4A76-8AA3-6B4B3764E87E", "type": "customer", "customerId": "137B4594-90AC-4A76-8AA3-6B4B3764E87E", "title": "", "firstName": "Franklin", "lastName": "Jai", "emailAddress": "franklin29@adventure-works.com", "phoneNumber": "1 (11) 500 555-0114", "creationDate": "2014-05-05T00:00:00", "addresses": [{ "addressLine1": "409, rue Saint Denis", "addressLine2": "", "city": "Paris", "state": "75 ", "country": "FR", "zipCode": "75005" }], "password": { "hash": "X2vl0BTxqBFjVsoYWDMiIhx3SexKCVP2jIuVmsj/Zno=", "salt": "E8B8686B" }, "salesOrderCount": 1 },
              { "generation": 0, child: { "generation": 1, child: { "generation": 2, child: { "generation": 3, child: { "generation": 4 } } } }}
            ],
            nbItems: 3,
            limit: 20,
            offset: 0,
            total: 3
          }
        });
        break;
    }
  }
};


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
