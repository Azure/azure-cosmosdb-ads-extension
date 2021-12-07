import * as vscode from "vscode";
import * as azdata from "azdata";
import * as nls from "vscode-nls";
import { AppContext } from "../appContext";
import { promises as fs } from "fs";
import * as path from "path";

const localize = nls.loadMessageBundle();

export const ingestSampleMongoData = async (
  appContext: AppContext,
  context: vscode.ExtensionContext,
  connection: azdata.ConnectionInfo,
  databaseName: string
): Promise<void> => {
  try {
    const rawData = await fs.readFile(path.join(context.extensionPath, "resources", "sampleData.json"));
    const sampleData = JSON.parse(rawData.toString());
    const count = await appContext.insertDocuments(connection.options["server"], sampleData);
    vscode.window.showInformationMessage(localize("successInsertDoc", "Successfully inserted {0} docs", count));
  } catch (e) {
    vscode.window.showErrorMessage(e as string);
  }
};
