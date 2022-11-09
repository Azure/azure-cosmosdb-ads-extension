import { useState } from 'react';
import {JsonEditor} from "./react-json-editor/index";
import './App.css';

export interface AppProps {
  connectionId: string;
  databaseName: string;
  collectionName: string;
  queryResultJson?: string;
  onSubmitQuery: (connectionId: string, query: string) => void;
};

const App = (props: AppProps) => {
  const [query, setQuery] = useState<string>('{ "firstName": "Franklin" }');

  const handleSubmit = () => {
    if (props.connectionId && props.onSubmitQuery) {
      props.onSubmitQuery(props.connectionId, query);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <p>Connection ID: {props.connectionId}</p>
        <p>Database: {props.databaseName} Collection: {props.collectionName}</p>
        <input value={query} onChange={evt => setQuery(evt.target.value)} />
        <button onClick={handleSubmit}>Submit</button>

        {props.queryResultJson && (
          <JsonEditor
            jsonObject={props.queryResultJson}
            onChange={(output: any)=> {console.log(output)}}
            hideInsertObjectButton={true}
            expandToGeneration={0}
          />
        )}

        {/* {props.queryResult && props.queryResult.map((r: any) => (
          <p key={r["_id"]}>{JSON.stringify(r)}</p>
          )
        )} */}
      </header>
    </div>
  );
}

export default App;
