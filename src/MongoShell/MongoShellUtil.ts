import * as path from "path";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { PlatformInformation, Runtime } from "../BinaryInstallUtil/platform";
import * as tar from "tar";
import { Unzipper } from "../BinaryInstallUtil/zip";
import * as fs from "fs";

const localize = nls.loadMessageBundle();

export const installMongoShell = async (extensionPath: string): Promise<string | undefined> => {
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

  let { archiveFilename, binaryFilename } = filenamesMap.get(platformInformation.runtimeId)!;
  const binaryFullPath = path.join(installDirectory, binaryFilename);

  if (fs.existsSync(binaryFullPath)) {
    // File exists don't do anything
    return binaryFullPath;
  }

  const statusView = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusView.show();

  statusView.text = localize("installingMongoShellTo", "Installing MongoShell to {0}", installDirectory);
  await extract(path.join(zipDirectory, archiveFilename), installDirectory);

  if (!fs.existsSync(binaryFullPath)) {
    return undefined;
  }

  statusView.text = localize("doneInstallingMongoShell", "Done installing MongoShell");
  return binaryFullPath;
};

const extract = (archivePath: string, targetPath: string): Promise<void> => {
  console.log(archivePath);
  if (archivePath.match(/\.tar\.gz|\.tar|\.gz$/i)) {
    return tar.x({
      file: archivePath,
      cwd: targetPath,
    });
  } else {
    // Default to zip extracting if it's not a tarball
    return new Unzipper().extract(archivePath, targetPath);
  }
};
