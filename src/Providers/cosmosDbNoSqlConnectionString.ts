import * as azdata from "azdata";

/**
 * AccountEndpoint=https://__cosmosdb_account__.documents.azure.com:443/;AccountKey=__account_key__;
 *
 * @param connectionString
 * @returns
 */
export const parseCosmosDbNoSqlConnectionString = (connectionString: string): azdata.ConnectionInfo | undefined => {
  if (connectionString.indexOf("AccountEndpoint") === -1 || connectionString.indexOf("AccountKey") === -1) {
    return undefined;
  }

  const components = connectionString.split(";");
  if (components.length < 2) {
    return undefined;
  }

  let accountEndpoint, accountKey;

  if (connectionString.indexOf("AccountEndpoint") < connectionString.indexOf("AccountKey")) {
    accountEndpoint = splitStringOnFirstOccurrence(components[0], "=")[1];
    accountKey = splitStringOnFirstOccurrence(components[1], "=")[1];
  } else {
    accountEndpoint = splitStringOnFirstOccurrence(components[1], "=")[1];
    accountKey = splitStringOnFirstOccurrence(components[0], "=")[1];
  }

  if (!accountEndpoint || !accountKey) {
    return undefined;
  }

  // Extract server from url
  const url = new URL(accountEndpoint);
  const server = url.host;

  return {
    options: {
      server,
      user: accountEndpoint,
      password: accountKey,
      authenticationType: "SqlLogin",
    },
  };
};

export const buildCosmosDbNoSqlConnectionString = (options: {
  authenticationType: string;
  server: string;
  user: string; // AccountEndpoint
  password: string;
}): string | undefined => {
  if (options.authenticationType === "AzureMFA") {
    // No connection string with Azure MFA
    return undefined;
  }

  return `AccountEndpoint=${options.user};AccountKey=${options.password};`;
};

/**
 * The 'AccountKey=key==' field contains the separator as part of the key
 * @param str
 * @param separator
 * @returns
 */
export const splitStringOnFirstOccurrence = (str: string, separator: string): [string, string | undefined] => {
  const index = str.indexOf(separator);
  if (index === -1) {
    return [str, undefined];
  }

  return [str.substring(0, index), str.substring(index + 1)];
};
