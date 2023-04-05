import * as path from "path";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import * as fs from "fs";
import { showStatusBarItem } from "../appContext";

// --------------------------------------------------------
// DO NOT IMPORT Events see Events in constants.ts
import { ServerProvider /*, Events */ } from "@microsoft/ads-service-downloader";
import { Events } from "../constant";
// ---------------------------------------------------------

const localize = nls.loadMessageBundle();
let outputChannel: vscode.OutputChannel;

export const downloadMongoShell = async (extensionPath: string): Promise<string> => {
  const rawConfig = await fs.readFileSync(path.join(extensionPath, "mongoShellConfig.json"));
  const config = JSON.parse(rawConfig.toString())!;
  config.installDirectory = path.join(extensionPath, config.installDirectory);
  config.proxy = vscode.workspace.getConfiguration("http").get<string>("proxy")!;
  config.strictSSL = vscode.workspace.getConfiguration("http").get("proxyStrictSSL") || true;

  const serverdownloader = new ServerProvider(config);
  serverdownloader.eventEmitter.onAny(generateHandleServerProviderEvent());
  return serverdownloader.getOrDownloadServer();
};

function generateHandleServerProviderEvent() {
  let dots = 0;
  return (e: string | string[], ...args: any[]) => {
    if (!outputChannel) {
      outputChannel = vscode.window.createOutputChannel("Download mongo shell");
    }

    switch (e) {
      case Events.INSTALL_START:
        outputChannel.show(true);
        outputChannel.appendLine(localize("installingMongoShellTo", "Installing MongoShell to {0}", args[0]));
        showStatusBarItem(localize("installingMongoShellTo", "Installing MongoShell to {0}", args[0]));
        break;
      case Events.INSTALL_END:
        outputChannel.appendLine(localize("installedMongoShell", "Installed MongoShell"));
        break;
      case Events.DOWNLOAD_START:
        outputChannel.appendLine(localize("downloading", "Downloading {0}", args[0]));
        outputChannel.append(`(${Math.ceil(args[1] / 1024).toLocaleString(vscode.env.language)} KB)`);
        showStatusBarItem(localize("downloadingMongoShell", "Downloading MongoShell"));
        break;
      case Events.DOWNLOAD_PROGRESS:
        let newDots = Math.ceil(args[0] / 5);
        if (newDots > dots) {
          outputChannel.append(".".repeat(newDots - dots));
          dots = newDots;
        }
        break;
      case Events.DOWNLOAD_END:
        outputChannel.appendLine(localize("doneInstallingMongoShell", "Done installing MongoShell"));
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
