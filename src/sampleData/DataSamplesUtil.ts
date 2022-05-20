import * as vscode from "vscode";
import * as azdata from "azdata";
import * as nls from "vscode-nls";
import { AppContext, isAzureConnection, validateMongoCollectionName } from "../appContext";
import { promises as fs } from "fs";
import * as path from "path";
import { IDatabaseDashboardInfo } from "../extension";

const localize = nls.loadMessageBundle();

export const ingestSampleMongoData = async (
  appContext: AppContext,
  context: vscode.ExtensionContext,
  databaseDashboardInfo: IDatabaseDashboardInfo
): Promise<void> => {
  try {
    const rawData = await fs.readFile(path.join(context.extensionPath, "resources", "sampleData", "customer.json"));
    const sampleData = JSON.parse(rawData.toString());

    if (sampleData.data.length < 1) {
      vscode.window.showErrorMessage(localize("noSampleDataProvided", "No sample data provided"));
      return;
    }

    if (!databaseDashboardInfo.databaseName) {
      databaseDashboardInfo.databaseName = sampleData.databaseId;
    }

    let collectionToCreate = sampleData.collectionId;

    // If collection already exists
    const collections = await appContext.listCollections(
      databaseDashboardInfo.server,
      databaseDashboardInfo.databaseName!
    );
    if (collections.find((c) => c.collectionName === sampleData.collectionId)) {
      collectionToCreate = await vscode.window.showInputBox({
        placeHolder: localize("collectionName", "Collection name"),
        prompt: localize("enterCollectionNameToCreate", "Enter collection name to create"),
        validateInput: validateMongoCollectionName,
        ignoreFocusOut: true,
      });
    }

    if (!collectionToCreate) {
      return;
    }

    const response = await vscode.window.showInformationMessage(
      localize(
        "ingestSampleMongoDataConfirm",
        "This will create a collection '{1}' inside database '{0}'. It may incur additional costs to your account. Do you want to proceed?",
        databaseDashboardInfo.databaseName,
        collectionToCreate
      ),
      ...[localize("yes", "Yes"), localize("no", "No")]
    );
    if (response !== "Yes") {
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          message: localize("importingSampleData", "Importing sample data..."),
        });
        const { count, elapsedTimeMS } = await appContext.insertDocuments(databaseDashboardInfo, sampleData);
        setTimeout(() => {
          vscode.window.showInformationMessage(
            localize(
              "successInsertDoc",
              `Successfully inserted {0} documents (took ${Math.floor(elapsedTimeMS / 1000)}s)`,
              count
            )
          );
        }, 0);
      }
    );
  } catch (e) {
    vscode.window.showErrorMessage(e as string);
  }
};
