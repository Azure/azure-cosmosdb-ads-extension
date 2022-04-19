/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import { CollStats } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { AppContext, getAccountName, isAzureconnection, retrieveMongoDbCollectionsInfoFromArm } from "../appContext";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { ingestSampleMongoData } from "../sampleData/DataSamplesUtil";
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
        light: context.asAbsolutePath("resources/light/add-database.svg"),
        dark: context.asAbsolutePath("resources/dark/add-database-inverse.svg"),
      },
      onDidClick: () =>
        vscode.commands.executeCommand("cosmosdb-ads-extension.createMongoCollection", {
          connectionProfile: connection,
          nodeInfo: {
            nodePath: createNodePath("server", databaseName),
          },
        }),
    },
    {
      label: localize("openMongoShell", "Open Mongo Shell"),
      iconPath: {
        light: context.asAbsolutePath("resources/light/mongo-shell.svg"),
        dark: context.asAbsolutePath("resources/dark/mongo-shell-inverse.svg"),
      },
      onDidClick() {
        vscode.commands.executeCommand(
          "cosmosdb-ads-extension.openMongoShell",
          {
            connectionProfile: connection,
          },
          databaseName
        );
      },
    },
  ];
  const navElements: azdata.ButtonComponent[] = buttons.map((b) => {
    const component = view.modelBuilder.button().withProps(b).component();
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
  appContext: AppContext,
  context: vscode.ExtensionContext,
  databaseName: string,
  connection: azdata.ConnectionInfo
): azdata.Component => {
  const heroCards: azdata.ButtonComponent[] = [
    buildHeroCard(
      view,
      context.asAbsolutePath("resources/fluent/new-collection.svg"),
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
      context.asAbsolutePath("resources/fluent/new-database.svg"),
      localize("importSampleData", "Import Sample Data"),
      localize("sampleCollectionDescription", "Create a new collection using one of our sample datasets"),
      () => ingestSampleMongoData(appContext, context, connection, databaseName)
    ),
  ];

  const heroCardsContainer = view.modelBuilder
    .flexContainer()
    .withItems(heroCards, { flex: "0 0 auto" })
    .withLayout({ flexFlow: "row", flexWrap: "wrap" })
    .withProps({ CSSStyles: { width: "100%" } })
    .component();

  return view.modelBuilder
    .flexContainer()
    .withItems([
      view.modelBuilder
        .text()
        .withProps({
          value: localize("gettingStarted", "Getting started"),
          CSSStyles: { "font-family": "20px", "font-weight": "600" },
        })
        .component(),
      heroCardsContainer,
    ])
    .withLayout({ flexFlow: "column" })
    .withProps({
      CSSStyles: {
        padding: "10px",
      },
    })
    .component();
};

const buildCollectionsAreaAzure = async (
  databaseName: string,
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  connectionInfo: azdata.ConnectionInfo
): Promise<azdata.Component> => {
  retrieveMongoDbCollectionsInfoFromArm(
    connectionInfo.options["azureAccount"],
    connectionInfo.options["azureTenantId"],
    connectionInfo.options["azureResourceId"],
    getAccountName(connectionInfo),
    databaseName
  ).then((collectionsInfo) => {
    tableComponent.data = collectionsInfo.map((collection) => [
      <azdata.HyperlinkColumnCellValue>{
        title: collection.name,
        icon: context.asAbsolutePath("resources/fluent/collection.svg"),
      },
      collection.usageSizeKB === undefined ? localize("unknown", "Unknown") : collection.usageSizeKB,
      collection.documentCount === undefined ? localize("unknown", "Unknown") : collection.documentCount,
      collection.throughputSetting,
    ]);

    tableLoadingComponent.loading = false;
  });

  const tableComponent = view.modelBuilder
    .table()
    .withProps({
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
      data: [],
      height: 500,
      CSSStyles: {
        padding: "20px",
      },
    })
    .component();

  const tableLoadingComponent = view.modelBuilder
    .loadingComponent()
    .withItem(tableComponent)
    .withProps({
      loading: true,
    })
    .component();

  return view.modelBuilder
    .flexContainer()
    .withItems([
      view.modelBuilder
        .text()
        .withProps({
          value: localize("collectionOverview", "Collection overview"),
          CSSStyles: { "font-size": "20px", "font-weight": "600" },
        })
        .component(),
      view.modelBuilder
        .text()
        .withProps({
          value: localize("collectionOverviewDescription", "Click on a collection to work with the data"),
        })
        .component(),
      tableLoadingComponent,
    ])
    .withLayout({ flexFlow: "column" })
    .withProps({ CSSStyles: { padding: "10px" } })
    .component();
};

const buildCollectionsAreaNonAzure = async (
  databaseName: string,
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  appContext: AppContext,
	connectionInfo: azdata.ConnectionInfo
): Promise<azdata.Component> => {
  const server = connectionInfo.options["server"];

  appContext.listCollections(server, databaseName).then(async (collectionsInfo) => {
    const statsMap = new Map<string, CollStats>();
    // Retrieve all stats for each collection
    await Promise.all(
      collectionsInfo.map((collection) =>
        collection.stats().then((stats) => statsMap.set(collection.collectionName, stats))
      )
    );

    tableComponent.data = collectionsInfo.map((collection) => {
      const stats = statsMap.get(collection.collectionName);
      return [
        <azdata.HyperlinkColumnCellValue>{
          title: collection.collectionName,
          icon: context.asAbsolutePath("resources/fluent/collection.svg"),
        },
        stats?.storageSize,
        stats?.count,
      ];
    });

    tableLoadingComponent.loading = false;
  });

  const tableComponent = view.modelBuilder
    .table()
    .withProps({
      columns: [
        <azdata.HyperlinkColumn>{
          value: localize("collection", "Collection"),
          type: azdata.ColumnType.hyperlink,
          name: "Collection",
          width: 250,
        },
        {
          value: localize("dataUsage", "Storage Size (bytes)"),
          type: azdata.ColumnType.text,
        },
        {
          value: localize("documents", "Documents"),
          type: azdata.ColumnType.text,
        },
      ],
      data: [],
      height: 500,
      CSSStyles: {
        padding: "20px",
      },
    })
    .component();

  const tableLoadingComponent = view.modelBuilder
    .loadingComponent()
    .withItem(tableComponent)
    .withProps({
      loading: true,
    })
    .component();

  return view.modelBuilder
    .flexContainer()
    .withItems([
      view.modelBuilder
        .text()
        .withProps({
          value: localize("collectionOverview", "Collection overview"),
          CSSStyles: { "font-size": "20px", "font-weight": "600" },
        })
        .component(),
      view.modelBuilder
        .text()
        .withProps({
          value: localize("collectionOverviewDescription", "Click on a collection to work with the data"),
        })
        .component(),
      tableLoadingComponent,
    ])
    .withLayout({ flexFlow: "column" })
    .withProps({ CSSStyles: { padding: "10px" } })
    .component();
};

export const openDatabaseDashboard = async (
  cosmosDbAccountName: string,
  databaseName: string,
  appContext: AppContext,
  context: vscode.ExtensionContext
): Promise<void> => {
  const connectionInfo = (await azdata.connection.getConnections()).filter(
    (connectionInfo) => connectionInfo.options["server"] === cosmosDbAccountName
  )[0];
  if (!connectionInfo) {
    // TODO Handle error here
    vscode.window.showErrorMessage(localize("noValidConnection", "No valid connection found"));
    return;
  }

  const dashboard = azdata.window.createModelViewDashboard(databaseName);
  dashboard.registerTabs(async (view: azdata.ModelView) => {
    const input1 = view.modelBuilder.inputBox().withProps({ value: databaseName }).component();

    const viewItem = isAzureconnection(connectionInfo)
      ? await buildCollectionsAreaAzure(databaseName, view, context, connectionInfo)
      : await buildCollectionsAreaNonAzure(databaseName, view, context, appContext, connectionInfo);

    const homeTabContainer = view.modelBuilder
      .flexContainer()
      .withItems([buildWorkingWithDatabase(view, appContext, context, databaseName, connectionInfo), viewItem])
      .withLayout({ flexFlow: "column" })
      .component();

    const homeTab: azdata.DashboardTab = {
      id: "home",
      toolbar: buildToolbar(view, context, databaseName, connectionInfo),
      content: homeTabContainer,
      title: "Home",
      icon: context.asAbsolutePath("resources/fluent/home.svg"), // icon can be the path of a svg file
    };

    // TODO Implement this tab
    const collectionsTab: azdata.DashboardTab = {
      id: "collections",
      content: input1,
      title: localize("collections", "Collections"),
      icon: context.asAbsolutePath("resources/fluent/collection.svg"),
    };

    return [homeTab /*, collectionsTab */];
  });
  await dashboard.open();
};
