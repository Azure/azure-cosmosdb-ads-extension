import * as assert from "assert";
import ConnectionString from "mongodb-connection-string-url";
import { after } from "mocha";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { buildMongoConnectionString, parseMongoConnectionString } from "../../Providers/mongoConnectionString";
import { convertToConnectionOptions } from "../../models";
import { buildCosmosDbNoSqlConnectionString, parseCosmosDbNoSqlConnectionString } from "../../Providers/cosmosDbNoSqlConnectionString";
// import * as myExtension from '../../extension';

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Sample test", () => {
    assert.equal(-1, [1, 2, 3].indexOf(5));
    assert.equal(-1, [1, 2, 3].indexOf(0));
  });
});

suite("Mongo connection String Test Suite", () => {
  const csTestInfos: {
    cs: string;
    server: string;
    user: string;
    password: string;
    authenticationType: string;
    pathname: string;
    search: string;
    isServer: boolean;
  }[] = [
    {
      cs: "mongodb://test-mongo:password@test-mongo.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=987&appName=@test-mongo@",
      server: "test-mongo.mongo.cosmos.azure.com:10255",
      user: "test-mongo",
      password: "password",
      authenticationType: "SqlLogin",
      pathname: "/",
      search: "?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=987&appName=@test-mongo@",
      isServer: false,
    },
    {
      cs: "mongodb://localhost",
      server: "localhost",
      user: "",
      password: "",
      authenticationType: "Integrated",
      pathname: "/",
      search: "",
      isServer: false,
    },
    {
      cs: "mongodb://sysop:moon@localhost",
      server: "localhost",
      user: "sysop",
      password: "moon",
      authenticationType: "SqlLogin",
      pathname: "/",
      search: "",
      isServer: false,
    },
    {
      cs: "mongodb://sysop:moon@localhost/records",
      server: "localhost",
      user: "sysop",
      password: "moon",
      authenticationType: "SqlLogin",
      pathname: "/records",
      search: "",
      isServer: false,
    },
    {
      cs: "mongodb://%2Ftmp%2Fmongodb-27017.sock",
      server: "%2Ftmp%2Fmongodb-27017.sock",
      user: "",
      password: "",
      authenticationType: "Integrated",
      pathname: "/",
      search: "",
      isServer: false,
    },
    {
      cs: "mongodb://db1.example.net,db2.example.com/?replicaSet=test",
      server: "db1.example.net,db2.example.com",
      user: "",
      password: "",
      authenticationType: "Integrated",
      pathname: "/",
      search: "?replicaSet=test",
      isServer: false,
    },
    {
      cs: "mongodb://router1.example.com:27017,router2.example2.com:27017,router3.example3.com:27017/",
      server: "router1.example.com:27017,router2.example2.com:27017,router3.example3.com:27017",
      user: "",
      password: "",
      authenticationType: "Integrated",
      pathname: "/",
      search: "",
      isServer: false,
    },
    {
      cs: "mongodb+srv://keyid:secretkey@cluster0.example.com/testdb?authSource=$external&authMechanism=MONGODB-AWS",
      server: "cluster0.example.com",
      user: "keyid",
      password: "secretkey",
      authenticationType: "SqlLogin",
      pathname: "/testdb",
      search: "?authSource=$external&authMechanism=MONGODB-AWS",
      isServer: true,
    },
  ];

  test("Parse and build connection string yields same string", () => {
    csTestInfos.forEach((csTestInfo) => {
      const parsedUrl = parseMongoConnectionString(csTestInfo.cs);

      if (!parsedUrl) {
        assert.fail(`Failed to parse ${csTestInfo.cs}`);
      }

      const options = convertToConnectionOptions(parsedUrl);
      const reconstructedUrl = buildMongoConnectionString(options);

      if (!reconstructedUrl) {
        assert.fail(`Failed to build mongo connection string: ${JSON.stringify(parsedUrl)}`);
      }

      assert(areUrlEquivalent(reconstructedUrl, csTestInfo.cs));
    });
  });

  test("Parse connection string extracts information", () => {
    csTestInfos.forEach((csTestInfo) => {
      const parsedUrl = parseMongoConnectionString(csTestInfo.cs);

      ["server", "user", "password", "authenticationType", "pathname", "search", "isServer"].forEach((field) =>
        assert.strictEqual((csTestInfo as any)[field], parsedUrl?.options[field])
      );
    });
  });

  test("Build connection string doesn't work for AzureMFA", () => {
    const options = {
      authenticationType: "AzureMFA",
      user: "user",
      password: "password",
    };
    assert.strictEqual(buildMongoConnectionString(options as any), undefined);
  });

  test("Build connection string with username/password", () => {
    const options = {
      authenticationType: "SqlLogin",
      user: "username",
      password: "password",
      server: "server",
      pathname: "/pathname",
      search: "?search=blah",
      isServer: false,
    };
    assert.strictEqual(buildMongoConnectionString(options), "mongodb://username:password@server/pathname?search=blah");
  });

  test("Build connection string no username/password", () => {
    const options = {
      authenticationType: "Integrated",
      user: "username",
      password: "password",
      server: "server",
      pathname: "/pathname",
      search: "?search=blah",
      isServer: false,
    };
    assert.strictEqual(buildMongoConnectionString(options), "mongodb://server/pathname?search=blah");
  });

  test("Build connection string mongodb+srv", () => {
    const options = {
      authenticationType: "Integrated",
      user: "username",
      password: "password",
      server: "server",
      pathname: "/pathname",
      search: "?search=blah",
      isServer: true,
    };
    assert.strictEqual(buildMongoConnectionString(options), "mongodb+srv://server/pathname?search=blah");
  });

  test("Build connection string no pathname no search params", () => {
    const options = {
      authenticationType: "Integrated",
      user: "username",
      password: "password",
      server: "server",
      pathname: "",
      search: "",
      isServer: true,
    };
    assert.strictEqual(buildMongoConnectionString(options), "mongodb+srv://server");
  });

  test("Build connection string cosmosdb account", () => {
    const options = {
      authenticationType: "SqlLogin",
      user: "username",
      password: "password",
      server: "server.cosmos.azure.com",
      pathname: "",
      search: "",
      isServer: false,
    };
    const cs = buildMongoConnectionString(options);
    assert.strictEqual(cs !== undefined, true);
    assert.match(cs!, /ssl=true/);
    assert.match(cs!, /replicaSet=globaldb/);
    assert.match(cs!, /retrywrites=false/);
    assert.match(cs!, /maxIdleTimeMS=120000/);
    assert.match(cs!, /appName=%40username%40/);
  });

  test("Build connection string cosmosdb account with port number", () => {
    const options = {
      authenticationType: "SqlLogin",
      user: "username",
      password: "password",
      server: "server.cosmos.azure.com:1234",
      pathname: "",
      search: "",
      isServer: false,
    };
    const cs = buildMongoConnectionString(options);
    assert.strictEqual(cs !== undefined, true);
    assert.match(cs!, /ssl=true/);
    assert.match(cs!, /replicaSet=globaldb/);
    assert.match(cs!, /retrywrites=false/);
    assert.match(cs!, /maxIdleTimeMS=120000/);
    assert.match(cs!, /appName=%40username%40/);
  });

  test("Build connection string cosmosdb vCore account", () => {
    const options = {
      authenticationType: "SqlLogin",
      user: "username",
      password: "password",
      server: "server.cosmos.azure.com",
      pathname: "",
      search: "",
      isServer: true,
    };
    const cs = buildMongoConnectionString(options);
    assert.strictEqual(cs !== undefined, true);
    assert.doesNotMatch(cs!, /ssl=true/);
    assert.doesNotMatch(cs!, /replicaSet=globaldb/);
    assert.doesNotMatch(cs!, /appName=%40username%40/);
    assert.match(cs!, /retrywrites=false/);
    assert.match(cs!, /tls=true/);
    assert.match(cs!, /maxIdleTimeMS=120000/);
    assert.match(cs!, /authMechanism=SCRAM-SHA-256/);
  });

  test("Build connection string cosmosdb account: do not overwrite maxIdleTimeMS", () => {
    const options = {
      authenticationType: "SqlLogin",
      user: "username",
      password: "password",
      server: "server.cosmos.azure.com:1234",
      pathname: "",
      search: "maxIdleTimeMS=123",
      isServer: false,
    };
    const cs = buildMongoConnectionString(options);
    assert.match(cs!, /maxIdleTimeMS=123/);
  });
});

const areUrlEquivalent = (urlString1: string, urlString2: string): boolean => {
  const url1 = new ConnectionString(urlString1);
  const url2 = new ConnectionString(urlString2);

  for (const [key1, value1] of url1.searchParams) {
    if (!url2.searchParams.has(key1) || url2.searchParams.get(key1) !== value1) {
      return false;
    }
  }

  for (const [key2, value2] of url2.searchParams) {
    if (!url1.searchParams.has(key2) || url1.searchParams.get(key2) !== value2) {
      return false;
    }
  }

  return true;
};

suite("CosmosDb NoSql connection String Test Suite", () => {
  const csTestInfos: {
    cs: string;
    server: string;
    user: string;
    password: string;
    authenticationType: string;
  }[] = [
    {
      cs: "AccountEndpoint=https://cdbaccount.documents.azure.com:443/;AccountKey=password==;",
      server: "cdbaccount.documents.azure.com",
      user: "https://cdbaccount.documents.azure.com:443/",
      password: "password==",
      authenticationType: "SqlLogin",
    },
    {
      cs: "AccountKey=password==;AccountEndpoint=https://cdbaccount.documents.azure.com:443/;",
      server: "cdbaccount.documents.azure.com",
      user: "https://cdbaccount.documents.azure.com:443/",
      password: "password==",
      authenticationType: "SqlLogin",
    },
  ];

  test("Parse and build connection string yields same string 2", () => {
    csTestInfos.forEach((csTestInfo) => {
      const parsedUrl = parseCosmosDbNoSqlConnectionString(csTestInfo.cs);

      if (!parsedUrl) {
        assert.fail(`Failed to parse ${csTestInfo.cs}`);
      }

      const options = convertToConnectionOptions(parsedUrl);
      const reconstructedUrl = buildCosmosDbNoSqlConnectionString(options);

      if (!reconstructedUrl) {
        assert.fail(`Failed to build nosql connection string: ${JSON.stringify(parsedUrl)}`);
      }

      assert(areCosmosDbNoSqlConnectionStringsEquivalent(reconstructedUrl, csTestInfo.cs));
    });
  });

  test("Parse connection string extracts information", () => {
    csTestInfos.forEach((csTestInfo) => {
      const parsedUrl = parseCosmosDbNoSqlConnectionString(csTestInfo.cs);

      ["server", "user", "password==", "authenticationType"].forEach((field) =>
        assert.strictEqual((csTestInfo as any)[field], parsedUrl?.options[field])
      );
    });
  });

  test("Build connection string doesn't work for AzureMFA", () => {
    const options = {
      authenticationType: "AzureMFA",
      user: "user",
      password: "password",
    };
    assert.strictEqual(buildCosmosDbNoSqlConnectionString(options as any), undefined);
  });

  // test("Build connection string with username/password", () => {
  //   const options = {
  //     authenticationType: "SqlLogin",
  //     user: "username",
  //     password: "password",
  //     server: "server",
  //     pathname: "/pathname",
  //     search: "?search=blah",
  //     isServer: false,
  //   };
  //   assert.strictEqual(buildMongoConnectionString(options), "mongodb://username:password@server/pathname?search=blah");
  // });
});

const areCosmosDbNoSqlConnectionStringsEquivalent = (c1: string, c2: string): boolean => {
  const components1 = c1.split(";");
  const components2 = c2.split(";");

  if (components1.length !== components2.length) {
    return false;
  }

  const map1 = new Map<string, string>();
  const map2 = new Map<string, string>();

  components1.forEach((component) => {
    const [key, value] = component.split("=");
    map1.set(key, value);
  });

  components2.forEach((component) => {
    const [key, value] = component.split("=");
    map2.set(key, value);
  });

  for (const [key1, value1] of map1) {
    if (!map2.has(key1) || map2.get(key1) !== value1) {
      return false;
    }
  }

  for (const [key2, value2] of map2) {
    if (!map1.has(key2) || map1.get(key2) !== value2) {
      return false;
    }
  }

  return true;
};