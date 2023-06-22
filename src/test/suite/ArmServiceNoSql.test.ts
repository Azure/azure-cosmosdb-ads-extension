import * as sinon from "sinon";
import * as assert from "assert";
import { ArmServiceNoSql } from "../../Services/ArmServiceNoSql";

suite("ArmServiceNoSql", () => {
  const fakeArmClient = {
    sqlResources: {
      getSqlDatabaseThroughput: () => undefined,
      listSqlDatabases: () => ({
        byPage: () => [[{ name: "BBB" }, { name: "ccc" }, { name: "aaa" }]],
      }),
      listSqlContainers: () => ({
        byPage: () => [[{ name: "EEE" }, { name: "fff" }, { name: "ddd" }]],
      }),
    },
  };

  test("Sort databases when retrieving from arm", async () => {
    const armServiceNoSql = new ArmServiceNoSql();
    sinon.stub(armServiceNoSql, "createArmClient").resolves(fakeArmClient as any);
    sinon.stub(armServiceNoSql, "createArmMonitorClient").resolves(undefined);

    const databases = await armServiceNoSql.retrieveDatabasesInfo(
      "azureAccountId",
      "azureTenantId",
      "azureResourceId",
      "cosmosDbAccountName",
      true
    );

    assert.strictEqual(databases.map((db) => db.name).join(","), "aaa,BBB,ccc");
  });

  test("Sort collections when retrieving from arm", async () => {
    const armServiceNoSql = new ArmServiceNoSql();
    sinon.stub(armServiceNoSql, "createArmClient").resolves(fakeArmClient as any);
    sinon.stub(armServiceNoSql, "createArmMonitorClient").resolves(undefined);

    const containers = await armServiceNoSql.retrieveContainersInfo(
      "azureAccountId",
      "azureTenantId",
      "azureResourceId",
      "cosmosDbAccountName",
      "databaseName"
    );

    assert.strictEqual(containers.map((coll) => coll.name).join(","), "ddd,EEE,fff");
  });
});
