import { URL } from "url";

export const isCosmosDBAccount = (connectionString: string): boolean => {
  /*
      const url = new URL(connectionString);
			const options: IMongoShellOptions = {
        username: url.username.length > 0  ? url.username : undefined,
        password: decodeURIComponent(url.password),
        hostname: url.hostname,
        port: url.port,
      };

			if (options.username?.length === 0) {
				options.username = undefined;
			}
			if (options.password?.length === 0) {
				options.password = undefined;
			}
			if (options.port?.length === 0) {
				options.port = undefined;
			}
	*/
  const url = new URL(connectionString);
  return url.hostname.includes("cosmos.azure.com");
};
