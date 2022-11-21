import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext, validateMongoCollectionName } from "../appContext";
import * as fs from "fs";
import * as path from "path";
import { IDatabaseDashboardInfo } from "../extension";
import { Events, ServerProvider } from "@microsoft/ads-service-downloader";

const localize = nls.loadMessageBundle();

export interface CdbCollectionCreateInfo {
  requiredThroughputRUPS: number;
  shardKey: string;
}

const downloadSampleData = async (extensionPath: string): Promise<string> => {
  const rawConfig = await fs.readFileSync(path.join(extensionPath, "sampleDataConfig.json"));
  const config = JSON.parse(rawConfig.toString())!;
  config.installDirectory = path.join(extensionPath, config.installDirectory);
  config.proxy = vscode.workspace.getConfiguration("http").get<string>("proxy")!;
  config.strictSSL = vscode.workspace.getConfiguration("http").get("proxyStrictSSL") || true;

  const serverdownloader = new ServerProvider(config);
  serverdownloader.eventEmitter.onAny(() => generateHandleServerProviderEvent());
  return serverdownloader.getOrDownloadServer();
};

export const ingestSampleMongoData = async (
  appContext: AppContext,
  context: vscode.ExtensionContext,
  databaseDashboardInfo: IDatabaseDashboardInfo
): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    const finalPath = await downloadSampleData(context.extensionPath);

    try {
      const rawData = fs.readFileSync(finalPath);
      const sampleData = JSON.parse(rawData.toString());

      if (sampleData.data.length < 1) {
        vscode.window.showErrorMessage(localize("noSampleDataProvided", "No sample data provided"));
        reject();
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
        reject();
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

      let _count, _elapsedTimeMS;

      try {
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
              databaseDashboardInfo,
              sampleData,
              collectionToCreate,
              {
                requiredThroughputRUPS: sampleData.offerThroughput,
                shardKey: sampleData.shardKey,
              }
            );
            _count = count;
            _elapsedTimeMS = elapsedTimeMS;
          }
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(e.message);
        return;
      }

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

const statusView = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
const outputChannel = vscode.window.createOutputChannel("download");

function generateHandleServerProviderEvent() {
  let dots = 0;
  return (e: string, ...args: any[]) => {
    switch (e) {
      case Events.INSTALL_START:
        outputChannel.show(true);
        statusView.show();
        outputChannel.appendLine(localize("installingSampleDataTo", "Installing sample data to {0}", args[0]));
        statusView.text = localize("installingSampleDataTo", "Installing sample data to {0}", args[0]);
        break;
      case Events.INSTALL_END:
        outputChannel.appendLine(localize("installedSampleData", "Installed sample data"));
        break;
      case Events.DOWNLOAD_START:
        outputChannel.appendLine(localize("downloading", "Downloading {0}", args[0]));
        outputChannel.append(`(${Math.ceil(args[1] / 1024).toLocaleString(vscode.env.language)} KB)`);
        statusView.text = localize("downloadingSampleData", "Downloading sample data");
        break;
      case Events.DOWNLOAD_PROGRESS:
        let newDots = Math.ceil(args[0] / 5);
        if (newDots > dots) {
          outputChannel.append(".".repeat(newDots - dots));
          dots = newDots;
        }
        break;
      case Events.DOWNLOAD_END:
        outputChannel.appendLine(localize("doneInstallingSampleData", "Done installing sample data"));
        break;
      default:
        console.error(localize("unknownEventFromServerProvider", "Unknown event from Server Provider {0}", e));
        break;
    }
  };
}
