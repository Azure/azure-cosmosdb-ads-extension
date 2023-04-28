import * as sinon from "sinon";
import * as assert from "assert";
import { ArmServiceMongo } from "../../Services/ArmServiceMongo";

suite("ArmServiceMongo", () => {
  const fakeArmClient = {
    mongoDBResources: {
      getMongoDBDatabaseThroughput: () => undefined,
      listMongoDBDatabases: () => ({
        byPage: () => [[{ name: "BBB" }, { name: "ccc" }, { name: "aaa" }]],
      }),
      listMongoDBCollections: () => ({
        byPage: () => [[{ name: "EEE" }, { name: "fff" }, { name: "ddd" }]],
      }),
    },
  };

  test("Sort databases when retrieving from arm", async () => {
    const armServiceMongo = new ArmServiceMongo();
    sinon.stub(armServiceMongo, "createArmClient").resolves(fakeArmClient as any);
    sinon.stub(armServiceMongo, "createArmMonitorClient").resolves(undefined);

    const databases = await armServiceMongo.retrieveDatabasesInfo(
      "azureAccountId",
      "azureTenantId",
      "azureResourceId",
      "cosmosDbAccountName",
      true
    );

    assert.strictEqual(databases.map((db) => db.name).join(","), "aaa,BBB,ccc");
  });

  test("Sort collections when retrieving from arm", async () => {
    const armServiceMongo = new ArmServiceMongo();
    sinon.stub(armServiceMongo, "createArmClient").resolves(fakeArmClient as any);
    sinon.stub(armServiceMongo, "createArmMonitorClient").resolves(undefined);

    const collections = await armServiceMongo.retrieveCollectionsInfo(
      "azureAccountId",
      "azureTenantId",
      "azureResourceId",
      "cosmosDbAccountName",
      "databaseName"
    );

    assert.strictEqual(collections.map((coll) => coll.name).join(","), "ddd,EEE,fff");
  });
});
