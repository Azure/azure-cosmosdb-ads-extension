# Azure Cosmos DB ADS Extension

The [Azure Cosmos DB extension for Azure Data Studio](https://github.com/Azure/azure-cosmosdb-ads-extension) is an open-source project that currently supports Azure Cosmos DB Mongo API accounts and Mongo databases.

## Getting Started
Download and install [Azure Data Studio](https://docs.microsoft.com/sql/azure-data-studio/download-azure-data-studio).
Click on the Extensions icon and install the Azure Cosmos DB (Mongo API) and Mongo extension.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

### Building the extension from source
* Clone the repository
* `cd <path_to_clone>`
* `yarn`
* `yarn run publish`

This creates an `azure-cosmosdb-ads-extension-x.y.z.vsix` file which can be manually installed in ADS.

#### Where are the build artifacts
The `out/` folder contains the output of the build process. The ESBuild bundler may only transpile `extension.js` (it transpiles the typescript source files as it bundles and therefore does not need `tsc` to transpiled the source before bundling) while `tsc` will transpile all the typescript files.

The `dist/` folder contains the output of the bundling process from ESBuild.
### Debugging the extension from source
There are two ways to debug the extension using Visual Studio Code:
* Debug using a regular installation of Azure Data Studio (Recommended)
* Debug using the source code of Azure Data Studio

#### Debugging using a regular installation of Azure Data Studio
This is the simplest way to debug.
* Make sure Azure Data Studio (ADS) is installed. You can download it from [here](https://learn.microsoft.com/sql/azure-data-studio/download-azure-data-studio).
* Clone this repository and open the folder in Visual Studio Code.
* `yarn` to install the dependencies
* `yarn run esbuild:watch` to automatically re-bundle for every source change.
* In the "Run and Debug" section of VSCode, select and run the "Extension" target. VSCode launches ADS and attaches to the process. You can set breakpoints etc.
* If you modify any code, you must re-run the debug target for the changes to take effect.


#### Debugging using Azure Data Studio source code
This setup is useful if your extension depend on some changes that you are bringing to Azure Data Studio. In this situation, you need to run the modified version of ADS and not a regular installation.
In that case, you want to run your modified version of ADS and also load your modified extension.
* Clone the [ADS repository](https://github.com/microsoft/azuredatastudio) (or your fork of it).
* Inside the ADS repository, there is an `extensions/` folder which contains all the ADS built-in extensions. Clone this extension repository inside this folder. Your extension path should now be: `<path_to_ADS_clone>/extensions/azure-cosmosdb-ads-extension`.
* In ADS, update the debug configuration file `launch.json`:
  Look for the "Attach to Extension Host" target and add the `dist/` directory in the `"outFiles"` section:
```
"outFiles": [
  "${workspaceFolder}/out/**/*.js",
  "${workspaceFolder}/extensions/*/out/**/*.js",
  "${workspaceFolder}/extensions/*/dist/**/*.js"   <------------- Add this line
],
```
* In one terminal window, automatically rebuild ADS on any changes:
  * cd `<path_to_ADS_clone>`
  * `yarn`
  * `yarn run watch`
* In another terminal window, automatically bundle the extension on any changes:
  * cd `<path_to_ADS_clone>/extensions/azure-cosmosdb-ads-extension`
  * `yarn`
  * `yarn run esbuild:watch`
* In ADS, launch the debug target: "Launch ADS & Debug Renderer and Extension Host". This will launch ADS and attach to the process.
* If you modify any code in ADS or the extension, you must re-start this target.

## Telemetry

This extension collects telemetry data, which is used to help understand how to improve the product. For example, this usage data helps to debug issues, such as slow start-up times, and to prioritize new features. While we appreciate the insights this data provides, we also know that not everyone wants to send usage data and you can disable telemetry as described in the Azure Data Studio [disable telemetry reporting](https://github.com/Microsoft/azuredatastudio/wiki/How-to-Disable-Telemetry-Reporting#how-to-disable-telemetry-reporting) documentation.

## Privacy Statement

To learn more about our Privacy Statement visit [this link](https://go.microsoft.com/fwlink/?LinkID=824704).

## Data Collection
The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft’s privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.
## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

## License

This extension is licensed under the [MIT License](https://github.com/Azure/azure-cosmosdb-ads-extension/blob/main/LICENSE).
