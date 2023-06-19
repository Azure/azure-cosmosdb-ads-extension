import * as assert from "assert";
import { CosmosDbNoSqlService } from "../../Services/CosmosDbNoSqlService";
import { ArmServiceNoSql } from "../../Services/ArmServiceNoSql";

suite("CosmosDbNoSqlService", () => {
  const fakeNoSqlClient = {
    databases: {
      readAll: () => ({
        fetchAll: () => ({ resources: [{ id: "BBB" }, { id: "ccc" }, { id: "aaa" }] }),
      }),
    },
    database: () => ({
      containers: {
        readAll: () => ({
          fetchAll: () => ({ resources: [{ id: "EEE" }, { id: "fff" }, { id: "ddd" }] }),
        }),
      },
    }),
  };
  const SERVER = "SERVER";
  const fakeClientMap = new Map<string, any>();
  fakeClientMap.set(SERVER, fakeNoSqlClient);

  test("Sort databases", async () => {
    const service = new CosmosDbNoSqlService(new ArmServiceNoSql());
    service._cosmosClients = fakeClientMap;

    const databases = await service.listDatabases(SERVER);
    assert.strictEqual(databases.map((db) => db.name).join(","), "aaa,BBB,ccc");
  });

  test("Sort collections", async () => {
    const service = new CosmosDbNoSqlService(new ArmServiceNoSql());
    service._cosmosClients = fakeClientMap;

    const containers = await service.listContainers(SERVER, "databaseName");
    assert.strictEqual(containers.map((c) => c.id).join(","), "ddd,EEE,fff");
  });
});
