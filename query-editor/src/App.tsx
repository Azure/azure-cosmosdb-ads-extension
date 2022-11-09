import { useState } from 'react';
import {JsonEditor} from "./react-json-editor/index";
import './App.css';
import { MongoQuery, QueryResult } from '../../src/QueryClient/messageContract';

export interface AppProps {
  connectionId: string;
  databaseName: string;
  collectionName: string;
  onSubmitQuery: (connectionId: string, query: MongoQuery) => void;
  queryResult?: QueryResult;
};

const App = (props: AppProps) => {
  const [query, setQuery] = useState<string>('{ "firstName": "Franklin" }');

  const handleSubmit = (offset: number | undefined) => {
    if (props.connectionId && props.onSubmitQuery) {
      props.onSubmitQuery(props.connectionId, {
        query,
        limit,
        offset
      });
    }
  };

  const { queryResult } = props;
  const limit = props.queryResult?.limit;
  const offset = props.queryResult?.offset;

  return (
    <div className="App">
      <header className="App-header">
        <p>Connection ID: {props.connectionId}</p>
        <p>Database: {props.databaseName} Collection: {props.collectionName}</p>
        <input value={query} onChange={evt => setQuery(evt.target.value)} />
        <button onClick={() => handleSubmit(offset)}>Submit</button>
        {queryResult && (
          <div>
            <span>{offset} to {offset! + limit!} of {queryResult.total} </span>
            <button disabled={queryResult.offset <= 0} onClick={() => handleSubmit(offset !== undefined && limit !== undefined ? offset - limit: undefined)}>&#60;</button>
            <button disabled={queryResult.offset + queryResult.documents.length >= queryResult.total }
               onClick={() => handleSubmit(offset !== undefined && limit !== undefined ? offset + limit: undefined)}>&#62;</button>
            <div className="jsonEditor">
              <JsonEditor
                jsonObject={JSON.stringify(queryResult.documents, null, "")}
                onChange={(output: any) => { console.log(output) }}
                hideInsertObjectButton={true}
                expandToGeneration={0}
              />
            </div>
          </div>
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
