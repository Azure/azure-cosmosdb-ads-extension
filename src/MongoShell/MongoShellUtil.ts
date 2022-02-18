import { ServerProvider, IConfig, Events } from "@microsoft/ads-service-downloader";
import * as path from "path";
import { promises as fs } from "fs";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { PlatformInformation, Runtime } from "../BinaryInstallUtil/platform";
import * as tar from "tar";
import { Unzipper } from "../BinaryInstallUtil/zip";

const localize = nls.loadMessageBundle();

export const installMongoShell = async (extensionPath: string): Promise<string> => {
  const zipDirectory = path.join(extensionPath, "resources", "mongoshell", "1.1.9");
  const installDirectory = path.join(extensionPath, "mongoshellexecutable");

  const linuxMongosh = { archiveFilename: "linux-x64.tgz", binaryFilename: "mongosh" };

  const filenamesMap: Map<Runtime, { archiveFilename: string; binaryFilename: string }> = new Map([
    [Runtime.Windows_64, { archiveFilename: "win32-x64.zip", binaryFilename: "mongosh.exe" }],
    [Runtime.OSX, { archiveFilename: "darwin-x64.zip", binaryFilename: "mongosh" }],
    [Runtime.CentOS_7, linuxMongosh],
    [Runtime.Debian_8, linuxMongosh],
    [Runtime.Fedora_23, linuxMongosh],
    [Runtime.OpenSUSE_13_2, linuxMongosh],
    [Runtime.RHEL_7, linuxMongosh],
    [Runtime.SLES_12_2, linuxMongosh],
    [Runtime.Ubuntu_14, linuxMongosh],
    [Runtime.Ubuntu_16, linuxMongosh],
  ]);

  const platformInformation = await PlatformInformation.getCurrent();

  if (!filenamesMap.has(platformInformation.runtimeId)) {
    const errorMsg = localize("runtimeNotSupported", `Runtime not supported ${platformInformation.runtimeId}`);
    vscode.window.showErrorMessage(errorMsg);
    throw new Error(errorMsg);
  }

  // TODO If exists already, don't extract!

  let { archiveFilename, binaryFilename } = filenamesMap.get(platformInformation.runtimeId)!;
  await extract(path.join(zipDirectory, archiveFilename), installDirectory);

  // TODO Verify that file actually exists
  return path.join(installDirectory, binaryFilename);
};

const extract = (archivePath: string, targetPath: string): Promise<void> => {
  console.log(archivePath);
  if (archivePath.match(/\.tar\.gz|\.tar|\.gz$/i)) {
    let entryCount = 0;
    return tar.x({
      file: archivePath,
      cwd: targetPath,
      // Currently just output -1 as total entries as that value isn't easily available using tar without extra work
      // onentry: (entry: tar.ReadEntry) => this.eventEmitter.emit(Events.ENTRY_EXTRACTED, entry.path, ++entryCount, -1)
    });
  } else {
    // Default to zip extracting if it's not a tarball
    return new Unzipper().extract(archivePath, targetPath);
  }
};

export const downloadMongoShell = async (extensionPath: string): Promise<string> => {
  const rawConfig = await fs.readFile(path.join(extensionPath, "mongoShellConfig.json"));
  const config = JSON.parse(rawConfig.toString())!;
  config.installDirectory = path.join(extensionPath, config.installDirectory);
  config.proxy = vscode.workspace.getConfiguration("http").get<string>("proxy")!;
  config.strictSSL = vscode.workspace.getConfiguration("http").get("proxyStrictSSL") || true;

  const serverdownloader = new ServerProvider(config);
  serverdownloader.eventEmitter.onAny(() => generateHandleServerProviderEvent());
  return serverdownloader.getOrDownloadServer();
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
        outputChannel.appendLine(localize("installingMongoShellTo", "Installing MongoShell to {0}", args[0]));
        statusView.text = localize("installingMongoShellTo", "Installing MongoShell to {0}", args[0]);
        break;
      case Events.INSTALL_END:
        outputChannel.appendLine(localize("installedMongoShell", "Installed MongoShell"));
        break;
      case Events.DOWNLOAD_START:
        outputChannel.appendLine(localize("downloading", "Downloading {0}", args[0]));
        outputChannel.append(`(${Math.ceil(args[1] / 1024).toLocaleString(vscode.env.language)} KB)`);
        statusView.text = localize("downloadingMongoShell", "Downloading MongoShell");
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
      default:
        console.error(localize("unknownEventFromServerProvider", "Unknown event from Server Provider {0}", e));
        break;
    }
  };
}
