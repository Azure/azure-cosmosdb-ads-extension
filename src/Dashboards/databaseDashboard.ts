/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import { ICellActionEventArgs } from "azdata";
import { CollStats } from "mongodb";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import {
  AppContext,
  getAccountNameFromOptions,
  isAzureAuthType,
  retrieveMongoDbCollectionsInfoFromArm,
} from "../appContext";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { ingestSampleMongoData } from "../sampleData/DataSamplesUtil";
import { buildHeroCard } from "./util";

const localize = nls.loadMessageBundle();

let refreshCollections: () => void;

const buildToolbar = (
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  databaseDashboardInfo: IDatabaseDashboardInfo
): azdata.ToolbarContainer => {
  const buttons: (azdata.ButtonProperties & { onDidClick: () => void })[] = [
    {
      label: localize("newCollection", "New Collection"),
      iconPath: {
        light: context.asAbsolutePath("resources/light/add-collection.svg"),
        dark: context.asAbsolutePath("resources/dark/add-collection-inverse.svg"),
      },
      onDidClick: () => {
        const param: IConnectionNodeInfo = {
          ...databaseDashboardInfo,
          nodePath: createNodePath(databaseDashboardInfo.server, databaseDashboardInfo.databaseName),
        };
        vscode.commands
          .executeCommand("cosmosdb-ads-extension.createMongoCollection", undefined, param)
          .then(() => refreshCollections && refreshCollections());
      },
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
          { ...databaseDashboardInfo },
          databaseDashboardInfo.databaseName
        );
      },
    },
    {
      label: localize("refresh", "Refresh"),
      iconPath: {
        light: context.asAbsolutePath("resources/light/refresh.svg"),
        dark: context.asAbsolutePath("resources/dark/refresh-inverse.svg"),
      },
      onDidClick() {
        refreshCollections && refreshCollections();
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
  databaseDashboardInfo: IDatabaseDashboardInfo
): azdata.Component => {
  const heroCards: azdata.ButtonComponent[] = [
    buildHeroCard(
      view,
      context.asAbsolutePath("resources/fluent/new-collection.svg"),
      localize("newCollection", "New Collection"),
      localize("newCollectionDescription", "Create a new collection to store you data"),
      () => {
        const param: IConnectionNodeInfo = {
          ...databaseDashboardInfo,
          nodePath: createNodePath(databaseDashboardInfo.server, databaseDashboardInfo.databaseName),
        };
        vscode.commands
          .executeCommand("cosmosdb-ads-extension.createMongoCollection", undefined, param)
          .then(() => refreshCollections && refreshCollections());
      }
    ),
    buildHeroCard(
      view,
      context.asAbsolutePath("resources/fluent/new-collection.svg"),
      localize("importSampleData", "Import Sample Data"),
      localize("sampleCollectionDescription", "Create a new collection using one of our sample datasets"),
      () => ingestSampleMongoData(appContext, context, databaseDashboardInfo)
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
  databaseDashboardInfo: IDatabaseDashboardInfo
): Promise<azdata.Component> => {
  refreshCollections = () => {
    retrieveMongoDbCollectionsInfoFromArm(
      databaseDashboardInfo.azureAccount,
      databaseDashboardInfo.azureTenantId,
      databaseDashboardInfo.azureResourceId,
      getAccountNameFromOptions(databaseDashboardInfo),
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
  };
  refreshCollections();

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

  tableComponent.onCellAction &&
    tableComponent.onCellAction((arg: ICellActionEventArgs) => {
      vscode.commands.executeCommand(
        "cosmosdb-ads-extension.openMongoShell",
        { ...databaseDashboardInfo },
        databaseDashboardInfo.databaseName
      );
    });

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
  databaseDashboardInfo: IDatabaseDashboardInfo
): Promise<azdata.Component> => {
  refreshCollections = () => {
    appContext.listCollections(databaseDashboardInfo.server, databaseName).then(async (collectionsInfo) => {
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
  };
  refreshCollections();

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

  tableComponent.onCellAction &&
    tableComponent.onCellAction((arg: ICellActionEventArgs) => {
      vscode.commands.executeCommand(
        "cosmosdb-ads-extension.openMongoShell",
        { ...databaseDashboardInfo },
        databaseDashboardInfo.databaseName
      );
    });

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
  databaseDashboardInfo: IDatabaseDashboardInfo,
  appContext: AppContext,
  context: vscode.ExtensionContext
): Promise<void> => {
  const databaseName = databaseDashboardInfo.databaseName ?? "Unknown Database";
  const dashboard = azdata.window.createModelViewDashboard(databaseName);
  dashboard.registerTabs(async (view: azdata.ModelView) => {
    const input1 = view.modelBuilder.inputBox().withProps({ value: databaseDashboardInfo.databaseName }).component();

    const viewItem = isAzureAuthType(databaseDashboardInfo.authenticationType)
      ? await buildCollectionsAreaAzure(databaseName, view, context, databaseDashboardInfo)
      : await buildCollectionsAreaNonAzure(databaseName, view, context, appContext, databaseDashboardInfo);

    const homeTabContainer = view.modelBuilder
      .flexContainer()
      .withItems([buildWorkingWithDatabase(view, appContext, context, databaseDashboardInfo), viewItem])
      .withLayout({ flexFlow: "column" })
      .component();

    const homeTab: azdata.DashboardTab = {
      id: "home",
      toolbar: buildToolbar(view, context, databaseDashboardInfo),
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
