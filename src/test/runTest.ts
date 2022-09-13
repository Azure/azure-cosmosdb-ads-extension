import * as path from "path";
import * as fs from "fs";
import { runTests } from "@vscode/test-electron";
import fetch from "node-fetch";
import * as tar from "tar";
import { Unzipper } from "../BinaryInstallUtil/zip";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download VS Code, unzip it and run the integration test
    // const testpath = await downloadAndUnzipVSCode("1.35.0");
    // console.log("testpath", testpath);

    const unitTestDirectory = path.resolve(extensionDevelopmentPath, "ads-binary");
    const downloadUrl = getDownloadUrl();
    console.log(`Downloading: ${downloadUrl} to ${unitTestDirectory}`);

    const filename = await downloadADSFile(getDownloadUrl(), unitTestDirectory);
    console.log(`Successfully downloaded ${filename}`);

    console.log(`Extracting ${filename}...`);
    await extract(filename, unitTestDirectory);

    const adsExecutablePath = path.resolve(unitTestDirectory, getADSExecutableFilename());
    if (!fs.existsSync(adsExecutablePath)) {
      console.error(`Could not find ${adsExecutablePath}`);
      process.exit(1);
    }

    await runTests({ vscodeExecutablePath: adsExecutablePath, extensionDevelopmentPath, extensionTestsPath });

    console.log("Finished");
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

const getADSExecutableFilename = () => {
  switch (process.platform) {
    case "win32":
      return "azuredatastudio.exe";
    default:
      return "azuredatastudio-linux-x64/bin/azuredatastudio";
  }
};

const getDownloadUrl = () => {
  switch (process.platform) {
    case "darwin":
      return "https://go.microsoft.com/fwlink/?linkid=2204569";
    case "win32":
      return "https://go.microsoft.com/fwlink/?linkid=2204772";
    default:
      /* linux */
      return "https://go.microsoft.com/fwlink/?linkid=2204773";
  }
};

const downloadADSFile = async (url: string, targetFolder: string): Promise<string> => {
  if (fs.existsSync(targetFolder)) {
    fs.rmdirSync(targetFolder, { recursive: true });
  }
  fs.mkdirSync(targetFolder);

  const response = await fetch(url);
  // Get filename from URL
  const fullPath = path.resolve(targetFolder, response.url.substring(response.url.lastIndexOf("/") + 1));
  console.log(`Saving to ${fullPath}...`);
  const fileStream = fs.createWriteStream(fullPath);
  await new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on("error", reject);
    fileStream.on("finish", resolve);
  });

  return fullPath;
};

const extract = (archivePath: string, targetPath: string): Promise<void> => {
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

main();
