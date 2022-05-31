import * as vscode from "vscode";
import * as azdata from "azdata";
import * as nls from "vscode-nls";
import { AppContext, isAzureConnection, validateMongoCollectionName } from "../appContext";
import { promises as fs } from "fs";
import * as path from "path";

const localize = nls.loadMessageBundle();

export const ingestSampleMongoData = async (
  appContext: AppContext,
  context: vscode.ExtensionContext,
  serverName: string,
  databaseName: string
): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const rawData = await fs.readFile(path.join(context.extensionPath, "resources", "sampleData", "customer.json"));
      const sampleData = JSON.parse(rawData.toString());

      if (sampleData.data.length < 1) {
        vscode.window.showErrorMessage(localize("noSampleDataProvided", "No sample data provided"));
        reject();
        return;
      }

      if (!databaseName) {
        databaseName = sampleData.databaseId;
      }

      let collectionToCreate = sampleData.collectionId;

      // If collection already exists
      const collections = await appContext.listCollections(serverName, databaseName!);
      if (collections.find((c) => c.collectionName === sampleData.collectionId)) {
        collectionToCreate = await vscode.window.showInputBox({
          placeHolder: localize("collectionName", "Collection name"),
          prompt: localize("collectionExistEnterNewName", "Enter collection name to create"),
          validateInput: validateMongoCollectionName,
          ignoreFocusOut: true,
        });
      }

      if (!collectionToCreate) {
        reject();
        return;
      }

      const response = await vscode.window.showInformationMessage(
        localize(
          "ingestSampleMongoDataConfirm",
          "This will create a collection '{1}' inside database '{0}'. It may incur additional costs to your account. Do you want to proceed?",
          databaseName,
          collectionToCreate
        ),
        ...[localize("yes", "Yes"), localize("no", "No")]
      );
      if (response !== "Yes") {
        reject();
        return;
      }

      let _count, _elapsedTimeMS;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            message: localize("importingSampleData", "Importing sample data..."),
          });
          const { count, elapsedTimeMS } = await appContext.insertDocuments(
            serverName,
            sampleData,
            databaseName,
            collectionToCreate
          );
          _count = count;
          _elapsedTimeMS = elapsedTimeMS;
        }
      );
      vscode.window.showInformationMessage(
        localize(
          "successInsertDoc",
          `Successfully inserted {0} documents (took ${Math.floor((_elapsedTimeMS ?? 0) / 1000)}s)`,
          _count
        )
      );
      resolve();
    } catch (e) {
      vscode.window.showErrorMessage(e as string);
    }

    reject();
  });
};
