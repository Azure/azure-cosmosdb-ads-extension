/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { retrieveMongoDbCollectionsInfoFromArm } from "../appContext";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { buildHeroCard } from "./util";

interface IButtonData {
  label: string;
  icon?: string;
  onClick?: () => void;
}

const localize = nls.loadMessageBundle();

const buildToolbar = (
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  databaseName: string,
  connection: azdata.ConnectionInfo
): azdata.ToolbarContainer => {
  const buttons: (azdata.ButtonProperties & { onDidClick: () => void })[] = [
    {
      label: localize("newCollection", "New Collection"),
      iconPath: {
        light: context.asAbsolutePath("images/AddDatabase.svg"),
        dark: context.asAbsolutePath("images/AddDatabase.svg"),
      },
      onDidClick: () =>
        vscode.commands.executeCommand("cosmosdb-ads-extension.createMongoCollection", {
          connectionProfile: connection,
          nodeInfo: {
            nodePath: createNodePath("server", databaseName),
          },
        }),
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

const buildWorkingWithDatabase = (
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  databaseName: string,
  connection: azdata.ConnectionInfo
): azdata.Component => {
  const heroCards: azdata.ButtonComponent[] = [
    buildHeroCard(
      view,
      context.asAbsolutePath("images/AddDatabase.svg"),
      localize("newCollection", "New Collection"),
      localize("newCollectionDescription", "Create a new collection to store you data"),
      () =>
        vscode.commands.executeCommand("cosmosdb-ads-extension.createMongoCollection", {
          connectionProfile: connection,
          nodeInfo: {
            nodePath: createNodePath("server", databaseName),
          },
        })
    ),
    buildHeroCard(
      view,
      context.asAbsolutePath("images/AddDatabase.svg"),
      localize("sampleCollection", "Sample collection"),
      localize("sampleCollectionDescription", "Create a new collection using one of our sample datasets"),
      () => {}
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
          value: localize("gettingStarted", "Getting started"),
          CSSStyles: { "font-family": "20px", "font-weight": "600" },
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

const buildCollectionsArea = async (
  databaseName: string,
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  connectionInfo: azdata.ConnectionInfo
): Promise<azdata.Component> => {
  const collectionsInfo = await retrieveMongoDbCollectionsInfoFromArm(connectionInfo, databaseName);

  const tableComponent = view.modelBuilder
    .table()
    .withProperties<azdata.TableComponentProperties>({
      columns: [
        <azdata.HyperlinkColumn>{
          value: localize("collection", "Collection"),
          type: azdata.ColumnType.hyperlink,
          name: "Collection",
          width: 250,
        },
        {
          value: localize("dataUsage", "Data Usage (KB)"),
          type: azdata.ColumnType.text,
        },
        {
          value: localize("documents", "Documents"),
          type: azdata.ColumnType.text,
        },
        {
          value: localize("throughput", "Throughput"),
          type: azdata.ColumnType.text,
        },
      ],
      data: collectionsInfo.map((collection) => [
        <azdata.HyperlinkColumnCellValue>{
          title: collection.name,
          icon: {
            light: context.asAbsolutePath("resources/light/collection.svg"),
            dark: context.asAbsolutePath("resources/dark/collection-inverse.svg"),
          },
        },
        collection.usageSizeKB === undefined ? localize("unknown", "Unknown") : collection.usageSizeKB,
        collection.documentCount === undefined ? localize("unknown", "Unknown") : collection.documentCount,
        collection.throughputSetting,
      ]),
      height: 500,
      CSSStyles: {
        padding: "20px",
      },
    })
    .component();

  return view.modelBuilder
    .flexContainer()
    .withItems([
      view.modelBuilder
        .text()
        .withProperties({
          value: localize("collectionOverview", "Collection overview"),
          CSSStyles: { "font-size": "20px", "font-weight": "600" },
        })
        .component(),
      view.modelBuilder
        .text()
        .withProperties({
          value: localize("collectionOverviewDescription", "Click on a collection to work with the data"),
        })
        .component(),
      tableComponent,
    ])
    .withLayout({ flexFlow: "column" })
    .withProperties({ CSSStyles: { padding: "10px" } })
    .component();
};

export const openDatabaseDashboard = async (
  azureAccountId: string,
  databaseName: string,
  context: vscode.ExtensionContext
): Promise<void> => {
  const connectionInfo = (await azdata.connection.getConnections()).filter(
    (connectionInfo) => connectionInfo.options["azureAccount"] === azureAccountId
  )[0];
  if (!connectionInfo) {
    // TODO Handle error here
    vscode.window.showErrorMessage(localize("noValidConnection", "No valid connection found"));
    return;
  }

  const dashboard = azdata.window.createModelViewDashboard(databaseName);
  dashboard.registerTabs(async (view: azdata.ModelView) => {
    const input1 = view.modelBuilder
      .inputBox()
      .withProperties<azdata.InputBoxProperties>({ value: databaseName })
      .component();

    const homeTabContainer = view.modelBuilder
      .flexContainer()
      .withItems([
        buildWorkingWithDatabase(view, context, databaseName, connectionInfo),
        await buildCollectionsArea(databaseName, view, context, connectionInfo),
      ])
      .withLayout({ flexFlow: "column" })
      .component();

    const homeTab: azdata.DashboardTab = {
      id: "home",
      toolbar: buildToolbar(view, context, databaseName, connectionInfo),
      content: homeTabContainer,
      title: "Home",
      icon: context.asAbsolutePath("images/home.svg"), // icon can be the path of a svg file
    };

    // TODO Implement this tab
    const collectionsTab: azdata.DashboardTab = {
      id: "collections",
      content: input1,
      title: localize("collections", "Collections"),
      icon: {
        light: context.asAbsolutePath("resources/light/collection.svg"),
        dark: context.asAbsolutePath("resources/dark/collection-inverse.svg"),
      },
    };

    return [homeTab /*, collectionsTab */];
  });
  await dashboard.open();
};
