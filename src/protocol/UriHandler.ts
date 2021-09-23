/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * URI scheme:
 * azuredatastudio://microsoft.azure-cosmosdb-ads-extension/path/query-parameters-tbd-here
 * Can be tested by running on command line on windows:
 * azuredatastudio.exe --open-url azuredatastudio://microsoft.azure-cosmosdb-ads-extension/path?query1=value
 */
export class UriHandler implements vscode.UriHandler {

	handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
		vscode.window.showInformationMessage(`CosmosDB Extension received uri: ${uri.toString()}`);
	}
}
