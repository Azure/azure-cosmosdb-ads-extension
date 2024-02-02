import * as path from "path";
import { runTests } from "@microsoft/azdata-test";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download ADS, unzip it and run the integration test
    console.log("Executing unit tests...");
    await runTests({ extensionDevelopmentPath, extensionTestsPath });
    console.log("Finished test execution");
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
