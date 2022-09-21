import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { validateCosmosDbName } from "../../dialogUtil";

suite("CosmosDB name validation", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Correct value", () =>
    assert.strictEqual(
      validateCosmosDbName("db-col123P", (_) => {}),
      true
    ));

  test("Special characters ok", () =>
    assert.strictEqual(
      validateCosmosDbName(" !@$%^&*()_+-=", (_) => {}),
      true
    ));

  test("Undefined value invalid", () =>
    assert.strictEqual(
      validateCosmosDbName(undefined, (_) => {}),
      false
    ));

  test("May not end with space", () =>
    assert.strictEqual(
      validateCosmosDbName("abc ", (_) => {}),
      false
    ));

  test("Cannot contain character '\\'", () =>
    assert.strictEqual(
      validateCosmosDbName("abc\\123", (_) => {}),
      false
    ));

  test("Cannot contain character '/'", () =>
    assert.strictEqual(
      validateCosmosDbName("abc/123", (_) => {}),
      false
    ));

  test("Cannot contain character '#'", () =>
    assert.strictEqual(
      validateCosmosDbName("abc#123", (_) => {}),
      false
    ));

  test("Cannot contain character '?'", () =>
    assert.strictEqual(
      validateCosmosDbName("abc?123", (_) => {}),
      false
    ));
});
