/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import { ICellActionEventArgs } from "azdata";
import * as vscode from "vscode";
import { AppContext, retrieveDatabaseAccountInfoFromArm, retrieveMongoDbDatabasesInfoFromArm } from "../appContext";

const buildToolbar = (view: azdata.ModelView, context: vscode.ExtensionContext): azdata.ToolbarContainer => {
  const buttons: (azdata.ButtonProperties & { onDidClick: () => void })[] = [
    {
      label: "New Database",
      iconPath: {
        light: context.asAbsolutePath("images/AddDatabase.svg"),
        dark: context.asAbsolutePath("images/AddDatabase.svg"),
      },
      onDidClick: () =>
        vscode.commands.executeCommand("cosmosdb-ads-extension.createMongoDatabase", {
          connectionProfile: view.connection,
        }),
    },
    {
      label: "Open Mongo Shell",
      iconPath: {
        light: context.asAbsolutePath("images/Hosted-Terminal.svg"),
        dark: context.asAbsolutePath("images/Hosted-Terminal.svg"),
      },
      onDidClick() {
        vscode.commands.executeCommand("cosmosdb-ads-extension.openMongoShell", {
          connectionProfile: view.connection,
        });
      },
    },
    {
      label: "Refresh",
      iconPath: {
        light: context.asAbsolutePath("images/refresh-cosmos.svg"),
        dark: context.asAbsolutePath("images/refresh-cosmos.svg"),
      },
      onDidClick() {
        console.log("Not implemented");
      },
    },
    {
      label: "Learn more",
      iconPath: {
        light: context.asAbsolutePath("images/Info.svg"),
        dark: context.asAbsolutePath("images/Info.svg"),
      },
      onDidClick() {
        console.log("Not implemented");
      },
    },
  ];
  const navElements: azdata.ButtonComponent[] = buttons.map((b) => {
    const component = view.modelBuilder.button().withProperties(b).component();
    component.onDidClick(b.onDidClick);
    return component;
  });
  return view.modelBuilder
    .toolbarContainer()
    .withItems(navElements)
    .withLayout({ orientation: azdata.Orientation.Horizontal })
    .component();
};

const buildOverview = async (view: azdata.ModelView): Promise<azdata.Component> => {
  const databaseAccountInfo = await retrieveDatabaseAccountInfoFromArm(view.connection);
  const propertyItems: azdata.PropertiesContainerItem[] = [
    {
      displayName: "Status",
      value: databaseAccountInfo.serverStatus,
    },
    {
      displayName: "Consistency policy",
      value: databaseAccountInfo.consistencyPolicy,
    },
    {
      displayName: "Backup policy",
      value: databaseAccountInfo.backupPolicy,
    },
    {
      displayName: "Read location",
      value: databaseAccountInfo.readLocations.join(","),
    },
  ];

  const properties = view.modelBuilder.propertiesContainer().withProperties({ propertyItems }).component();
  return view.modelBuilder
    .divContainer()
    .withItems([properties])
    .withProperties({
      CSSStyles: {
        padding: "10px",
        "border-bottom": "1px solid rgba(128, 128, 128, 0.35)",
      },
    })
    .component();
};

const buildHeroCard = (
  view: azdata.ModelView,
  iconPath: string,
  title: string,
  description: string,
  onClick: () => void
): azdata.ButtonComponent => {
  const component = view.modelBuilder
    .button()
    .withProperties<azdata.ButtonProperties>({
      buttonType: azdata.ButtonType.Informational,
      height: 84,
      iconHeight: 32,
      iconPath,
      iconWidth: 32,
      title,
      description,
      width: 236,
    })
    .component();
  component.onDidClick(onClick);
  return component;
};

const buildGettingStarted = (view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component => {
  const heroCards: azdata.ButtonComponent[] = [
    buildHeroCard(
      view,
      context.asAbsolutePath("images/AddDatabase.svg"),
      "New Database",
      "Create database to store you data",
      () =>
        vscode.commands.executeCommand("cosmosdb-ads-extension.createMongoDatabase", {
          connectionProfile: view.connection,
        })
    ),
    buildHeroCard(
      view,
      context.asAbsolutePath("images/Hosted-Terminal.svg"),
      "Mongo shell",
      "Interact with data using Mongo shell",
      () =>
        vscode.commands.executeCommand("cosmosdb-ads-extension.openMongoShell", {
          connectionProfile: view.connection,
        })
    ),
    buildHeroCard(
      view,
      context.asAbsolutePath("images/azure.svg"),
      "Open in portal",
      "View and manage this account (e.g. backup settings) in Azure portal",
      () => openInPortal(view.connection)
    ),
    buildHeroCard(
      view,
      context.asAbsolutePath("images/Info.svg"),
      "Documentation",
      "Find quickstarts, how-to guides, and references.",
      () => {
        /* TODO NOT IMPLEMENTED */
      }
    ),
  ];

  const heroCardsContainer = view.modelBuilder
    .flexContainer()
    .withItems(heroCards)
    .withLayout({ flexFlow: "row", flexWrap: "wrap" })
    .withProperties({ CSSStyles: { width: "100%" } })
    .component();

  return view.modelBuilder
    .flexContainer()
    .withItems([
      view.modelBuilder
        .text()
        .withProperties({
          value: "Getting started",
          CSSStyles: { "font-size": "20px", "font-weight": "600" },
        })
        .component(),
      view.modelBuilder
        .text()
        .withProperties({
          value:
            "Getting started with creating a new database, using mongo shell, viewing documentation, and managing via portal",
        })
        .component(),
      heroCardsContainer,
    ])
    .withLayout({ flexFlow: "column" })
    .withProperties({
      CSSStyles: {
        padding: "10px",
      },
    })
    .component();
};

const buildTabArea = (view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component => {
  const input2 = view.modelBuilder
    .inputBox()
    .withProperties<azdata.InputBoxProperties>({ value: "input 2" })
    .component();

  const tabs: azdata.Tab[] = [
    {
      id: "tab1",
      content: buildGettingStarted(view, context),
      title: "Getting started",
    },
    {
      id: "tab2",
      content: input2,
      title: "Monitoring",
    },
  ];
  return view.modelBuilder
    .tabbedPanel()
    .withTabs(tabs)
    .withLayout({ orientation: azdata.TabOrientation.Horizontal })
    .withProps({
      CSSStyles: {
        height: "200px",
      },
    })
    .component();
};

const buildDatabasesArea = async (
  view: azdata.ModelView,
  context: vscode.ExtensionContext
): Promise<azdata.Component> => {
  const databasesInfo = await retrieveMongoDbDatabasesInfoFromArm(view.connection);

  const tableComponent = view.modelBuilder
    .table()
    .withProperties<azdata.TableComponentProperties>({
      columns: [
        <azdata.HyperlinkColumn>{
          value: "Database",
          type: azdata.ColumnType.hyperlink,
          name: "Database",
          width: 250,
        },
        {
          value: "Data Usage (KB)", // TODO Translate
          type: azdata.ColumnType.text,
        },
        {
          value: "Collections", // TODO Translate
          type: azdata.ColumnType.text,
        },
        {
          value: "Throughput Shared Across Collections", // TODO translate
          type: azdata.ColumnType.text,
        },
      ],
      data: databasesInfo.map((db) => [
        <azdata.HyperlinkColumnCellValue>{
          title: db.name,
          icon: {
            light: context.asAbsolutePath("resources/light/database.svg"),
            dark: context.asAbsolutePath("resources/dark/database-inverse.svg"),
          },
        },
        db.usageSizeKB === undefined ? "Unknown" : db.usageSizeKB,
        db.nbCollections,
        db.throughputSetting,
      ]),
      // updateCells: [ { row: 2, column: 1, value: 123 }],
      height: 500,
      CSSStyles: {
        padding: "20px",
      },
    })
    .component();

  if (tableComponent.onCellAction) {
    tableComponent.onCellAction((arg: ICellActionEventArgs) => {
      // vscode.window.showInformationMessage(
      //   `clicked: ${arg.row} row, ${arg.column} column, ${arg.columnName} columnName`
      // );
      const azureAccountId = view.connection.options["azureAccount"];
      vscode.commands.executeCommand(
        "cosmosdb-ads-extension.openDatabaseDashboard",
        azureAccountId,
        databasesInfo[arg.row].name,
        context
      );
    });
  }

  return view.modelBuilder
    .flexContainer()
    .withItems([
      view.modelBuilder
        .text()
        .withProperties({
          value: "Database overview",
          CSSStyles: { "font-size": "20px", "font-weight": "600" },
        })
        .component(),
      view.modelBuilder
        .text()
        .withProperties({
          value: "Click on a database for more details",
        })
        .component(),
      tableComponent,
    ])
    .withLayout({ flexFlow: "column" })
    .withProperties({ CSSStyles: { padding: "10px" } })
    .component();
};

export const registerHomeDashboardTabs = (context: vscode.ExtensionContext, appContext: AppContext): void => {
  azdata.ui.registerModelViewProvider("mongo-account-home", async (view) => {
    const homeTabContainer = view.modelBuilder
      .flexContainer()
      // .withItems([buildToolbar(view, context), await buildOverview(view), buildTabArea(view, context)]) // Use this for monitoring tab
      .withItems([buildToolbar(view, context), await buildOverview(view), buildGettingStarted(view, context)])
      .withLayout({ flexFlow: "column" })
      .component();
    await view.initializeModel(homeTabContainer);
  });

  azdata.ui.registerModelViewProvider("mongo-databases.tab", async (view) => {
    const homeTabContainer = view.modelBuilder
      .flexContainer()
      .withItems([await buildDatabasesArea(view, context)])
      .withLayout({ flexFlow: "column" })
      .component();
    await view.initializeModel(homeTabContainer);
  });
};

const openInPortal = (connection: azdata.connection.Connection) => {
  const azurePortalEndpoint = connection?.options?.azurePortalEndpoint;
  const azureResourceId = connection?.options?.azureResourceId;
  if (!azurePortalEndpoint || !azureResourceId) {
    vscode.window.showErrorMessage("Missing azure information from connection");
    return;
  }
  const url = `${azurePortalEndpoint}/#@microsoft.onmicrosoft.com/resource${azureResourceId}/overview`;
  vscode.env.openExternal(vscode.Uri.parse(url));
};
