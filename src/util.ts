/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const packageJson = require("../package.json");

export interface IPackageInfo {
  name: string;
  version: string;
  aiKey: string;
}

export const getPackageInfo = (): IPackageInfo => {
  return {
    name: packageJson.name,
    version: packageJson.version,
    aiKey: packageJson.aiKey,
  };
}

export const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);