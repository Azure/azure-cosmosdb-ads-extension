import * as vscode from "vscode";
import * as azdata from "azdata";
import * as nls from "vscode-nls";
import { AppContext, isAzureconnection } from "../appContext";
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
    const rawData = await fs.readFile(path.join(context.extensionPath, "resources", "sampleData", "customer.json"));
    const sampleData = JSON.parse(rawData.toString());

    if (sampleData.data.length < 1) {
      vscode.window.showErrorMessage(localize("noSampleDataProvided", "No sample data provided"));
      return;
    }

    if (!databaseName) {
      databaseName = sampleData.databaseId;
    }

    const response = await vscode.window.showInformationMessage(
      localize(
        "ingestSampleMongoDataConfirm",
        "This will create a collection '{1}' inside database '{0}'. Are you sure?",
        databaseName,
        sampleData.collectionId
      ),
      ...[localize("yes", "Yes"), localize("no", "No")]
    );
    if (response !== "Yes") {
      return;
    }

    const count = await appContext.insertDocuments(connection.options["server"], sampleData, databaseName);
    vscode.window.showInformationMessage(localize("successInsertDoc", "Successfully inserted {0} docs", count));
  } catch (e) {
    vscode.window.showErrorMessage(e as string);
  }
};
