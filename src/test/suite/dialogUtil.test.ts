import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { validateCosmosDbName } from "../../dialogUtil";

suite("CosmosDB name validation", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Correct value", () =>
    assert.strictEqual(
      validateCosmosDbName("db-col123", (_) => {}, 3, 15),
      true
    ));

  test("Undefined value invalid", () =>
    assert.strictEqual(
      validateCosmosDbName(undefined, (_) => {}, 3, 9),
      false
    ));

  test("min characters", () =>
    assert.strictEqual(
      validateCosmosDbName("ac", (_) => {}, 3, 9),
      false
    ));

  test("max characters", () =>
    assert.strictEqual(
      validateCosmosDbName("1234567890", (_) => {}, 3, 9),
      false
    ));

  test("Lowercase, numbers and hyphens", () =>
    assert.strictEqual(
      validateCosmosDbName("!@#$%^&*()", (_) => {}, 3, 9),
      false
    ));

  test("starts with lowercase or number", () =>
    assert.strictEqual(
      validateCosmosDbName("-abcd", (_) => {}, 3, 9),
      false
    ));

  test("ends with lowercase or number", () =>
    assert.strictEqual(
      validateCosmosDbName("absd-", (_) => {}, 3, 9),
      false
    ));
});
