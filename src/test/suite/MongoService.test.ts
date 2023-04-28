import * as assert from "assert";
import { MongoService } from "../../Services/MongoService";

suite("MongoService", () => {
  const fakeMongoClient = {
    db: () => ({
      admin: () => ({
        listDatabases: () => ({ databases: [{ name: "BBB" }, { name: "ccc" }, { name: "aaa" }] }),
      }),
      collections: async () =>
        Promise.resolve([{ collectionName: "EEE" }, { collectionName: "fff" }, { collectionName: "ddd" }]),
    }),
  };
  const SERVER = "SERVER";
  const fakeClientMap = new Map<string, any>();
  fakeClientMap.set(SERVER, fakeMongoClient);

  test("Sort databases", async () => {
    const service = new MongoService();
    service._mongoClients = fakeClientMap;

    const databases = await service.listDatabases(SERVER);
    assert.strictEqual(databases.map((db) => db.name).join(","), "aaa,BBB,ccc");
  });

  test("Sort collections", async () => {
    const service = new MongoService();
    service._mongoClients = fakeClientMap;

    const containers = await service.listCollections(SERVER, "databaseName");
    assert.strictEqual(containers.map((c) => c.collectionName).join(","), "ddd,EEE,fff");
  });
});
