import * as assert from "assert";
import ConnectionString from "mongodb-connection-string-url";
import { after } from "mocha";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { buildMongoConnectionString, parseMongoConnectionString } from "../../Providers/connectionString";
// import * as myExtension from '../../extension';

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Sample test", () => {
    assert.equal(-1, [1, 2, 3].indexOf(5));
    assert.equal(-1, [1, 2, 3].indexOf(0));
  });
});

suite("Connection String Test Suite", () => {
  const testConnStrings = [
    "mongodb://test-mongo:password@test-mongo.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@test-mongo@",
    "mongodb://localhost",
    "mongodb://sysop:moon@localhost",
    "mongodb://sysop:moon@localhost/records",
    "mongodb://%2Ftmp%2Fmongodb-27017.sock",
    "mongodb://db1.example.net,db2.example.com/?replicaSet=test",
    "mongodb://router1.example.com:27017,router2.example2.com:27017,router3.example3.com:27017/",
    "mongodb+srv://keyid:secretkey@cluster0.example.com/testdb?authSource=$external&authMechanism=MONGODB-AWS",
  ];

  test("Parse and build connection string yields same string", () => {
    testConnStrings.forEach((connectionString) => {
      const parsedUrl = parseMongoConnectionString(connectionString);

      if (!parsedUrl) {
        assert.fail(`Failed to parse ${connectionString}`);
      }

      const reconstructedUrl = buildMongoConnectionString(parsedUrl.options);

      if (!reconstructedUrl) {
        assert.fail(`Failed to build mongo connection string: ${JSON.stringify(parsedUrl)}`);
      }

      assert(areUrlEquivalent(reconstructedUrl, connectionString));
    });
  });
});

const areUrlEquivalent = (urlString1: string, urlString2: string): boolean => {
  const url1 = new ConnectionString(urlString1);
  const url2 = new ConnectionString(urlString2);

  // Normalize: mongodb://localhost is equivalent to mongodb://localhost/
  if (url1.pathname === "/") {
    url1.pathname = "";
  }
  if (url2.pathname === "/") {
    url2.pathname = "";
  }

  return url1.toString() === url2.toString();
};
