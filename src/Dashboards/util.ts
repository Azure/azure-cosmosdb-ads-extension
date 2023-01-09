/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as azdata from "azdata";
const packageJson = require("../../package.json");

export const buildHeroCard = (
  view: azdata.ModelView,
  iconPath: string,
  title: string,
  description: string,
  onClick: () => void
): azdata.ButtonComponent => {
  const button = view.modelBuilder
    .button()
    .withProps({
      buttonType: azdata.ButtonType.Informational,
      description,
      height: 84,
      iconHeight: 32,
      iconPath,
      iconWidth: 32,
      label: title,
      title,
      width: 236,
      CSSStyles: {
        "box-shadow": "0px 1.6px 3.6px rgba(0, 0, 0, 0.132)",
        margin: "10px",
      },
    })
    .component();
  button.onDidClick(onClick); // TODO Make sure to manage disposable (unlisten)
  return button;
};

export interface IPackageInfo {
  name: string;
  version: string;
  aiKey: string;
}

export interface IMongoShellConfig {
  downloadUrl: string;
  version: string;
  downloadFileNames: { [platform: string]: string };
  installDirectory: string;
  executableFiles: string[];
  retry: {
    retries: number;
    factor: number;
    minTimeout: number;
    maxTimeout: number;
    randomize: boolean;
  };
}

export function getPackageInfo(): IPackageInfo {
  return {
    name: packageJson.name,
    version: packageJson.version,
    aiKey: packageJson.aiKey,
  };
}
