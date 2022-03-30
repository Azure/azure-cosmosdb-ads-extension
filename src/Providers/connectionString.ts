import ConnectionString from "mongodb-connection-string-url";
import * as azdata from "azdata";

const COSMOS_AZURE_HOSTNAME = ".mongo.cosmos.azure.com";

/**
 * Specs are here:
 * Examples from here: https://www.mongodb.com/docs/manual/reference/connection-string/#std-label-connections-connection-examples
 * mongodb://languye-mongo:password@languye-mongo.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@languye-mongo@
 * mongodb://localhost
 * mongodb://sysop:moon@localhost
 * mongodb://sysop:moon@localhost/records
 * mongodb://%2Ftmp%2Fmongodb-27017.sock : socket filepath
 * mongodb://db1.example.net,db2.example.com/?replicaSet=test : replica. Take first host
 * mongodb://router1.example.com:27017,router2.example2.com:27017,router3.example3.com:27017/ : multiple mongo instances
 * mongodb+srv://<aws access key id>:<aws secret access key>@cluster0.example.com/testdb?authSource=$external&authMechanism=MONGODB-AWS : mongo atlas
 *
 * @param connectionString
 * @returns
 */
export const parseMongoConnectionString = (connectionString: string): azdata.ConnectionInfo | undefined => {
  const url = new ConnectionString(connectionString);
  const hosts = url.hosts;

  if (!hosts || hosts.length < 1) {
    return undefined;
  }

  console.log(url);

  const username = url.username;
  let authenticationType = "SqlLogin";
  if (!username) {
    authenticationType = "Integrated";
  }

  return {
    options: {
      server: hosts.join(","),
      user: username,
      password: url.password,
      authenticationType,
      pathname: url.pathname,
      search: url.search,
      isServer: url.isSRV,
    },
  };
};

export const buildMongoConnectionString = (options: any): string | undefined => {
  if (options.authenticationType === "AzureMFA") {
    // No connection string with Azure MFA
    return undefined;
  }

  const url = new ConnectionString(`mongodb${options.isServer ? "+srv" : ""}://placeholder`);
  url.hosts = options["server"].split(",");

  if (options.authenticationType === "SqlLogin") {
    url.username = options["user"];
    url.password = options["password"];
  }

  url.pathname = options["pathname"];
  url.search = options["search"];

  return url.toString();
};
