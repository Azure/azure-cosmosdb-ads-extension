import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext, hideStatusBarItem, showStatusBarItem } from "../appContext";
import * as fs from "fs";
import * as path from "path";
import { IDatabaseDashboardInfo } from "../extension";
import { validateMongoCollectionName } from "../Services/MongoService";

// --------------------------------------------------------
// DO NOT IMPORT Events see Events in constants.ts
import { ServerProvider /*, Events */ } from "@microsoft/ads-service-downloader";
import { Events } from "../constant";
// ---------------------------------------------------------

const localize = nls.loadMessageBundle();

export interface CdbCollectionCreateInfo {
  requiredThroughputRUPS: number;
  shardKey: string;
}

let outputChannel: vscode.OutputChannel;

const downloadSampleData = async (extensionPath: string): Promise<string> => {
  const rawConfig = await fs.readFileSync(path.join(extensionPath, "sampleDataConfig.json"));
  const config = JSON.parse(rawConfig.toString())!;
  config.installDirectory = path.join(extensionPath, config.installDirectory);
  config.proxy = vscode.workspace.getConfiguration("http").get<string>("proxy")!;
  config.strictSSL = vscode.workspace.getConfiguration("http").get("proxyStrictSSL") || true;

  const serverdownloader = new ServerProvider(config);
  serverdownloader.eventEmitter.onAny(generateHandleServerProviderEvent());
  return serverdownloader.getOrDownloadServer();
};

export const ingestSampleMongoData = async (
  appContext: AppContext,
  context: vscode.ExtensionContext,
  databaseDashboardInfo: IDatabaseDashboardInfo
): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    showStatusBarItem(localize("downloadingSampleData", "Downloading sample data..."));
    const finalPath = await downloadSampleData(context.extensionPath);
    hideStatusBarItem();

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
      const collections = await appContext.mongoService.listCollections(
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
            const { count, elapsedTimeMS } = await appContext.mongoService.insertDocuments(
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

function generateHandleServerProviderEvent() {
  let dots = 0;
  return (e: string | string[], ...args: any[]) => {
    if (!outputChannel) {
      outputChannel = vscode.window.createOutputChannel("Download sample data");
    }

    switch (e) {
      case Events.INSTALL_START:
        outputChannel.show(true);
        outputChannel.appendLine(localize("installingSampleDataTo", "Installing sample data to {0}", args[0]));
        showStatusBarItem(localize("installingSampleDataTo", "Installing sample data to {0}", args[0]));
        break;
      case Events.INSTALL_END:
        outputChannel.appendLine(localize("installedSampleData", "Installed sample data"));
        break;
      case Events.DOWNLOAD_START:
        outputChannel.appendLine(localize("downloading", "Downloading {0}", args[0]));
        outputChannel.append(`(${Math.ceil(args[1] / 1024).toLocaleString(vscode.env.language)} KB)`);
        showStatusBarItem(localize("downloadingSampleData", "Downloading sample data"));
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
      case Events.LOG_EMITTED:
        // noop
        break;
      default:
        console.error(
          localize(
            "unknownEventFromServerProvider",
            "Unknown event from Server Provider {0}: {1}",
            e as string,
            JSON.stringify(args)
          )
        );
        args[1] && outputChannel.appendLine(args[1]);
        break;
    }
  };
}
