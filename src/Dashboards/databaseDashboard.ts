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
  changeMongoDbCollectionThroughput,
  openAccountDashboard,
} from "../appContext";
import { Telemetry } from "../constant";
import { IConnectionNodeInfo, IDatabaseDashboardInfo } from "../extension";
import { convertToConnectionOptions, ICosmosDbCollectionInfo } from "../models";
import { ProviderId } from "../Providers/connectionProvider";
import { createNodePath } from "../Providers/objectExplorerNodeProvider";
import { ingestSampleMongoData } from "../sampleData/DataSamplesUtil";
import { buildHeroCard } from "./util";

const localize = nls.loadMessageBundle();

let refreshCollections: () => void;

const buildToolbar = (
  view: azdata.ModelView,
  context: vscode.ExtensionContext,
  appContext: AppContext,
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
        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.toolbarNewCollection
        );
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
        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.toolbarOpenMongoShell
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
        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.toolbarRefresh
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
        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.gettingStartedNewCollection
        );
      }
    ),
    buildHeroCard(
      view,
      context.asAbsolutePath("resources/fluent/new-collection.svg"),
      localize("importSampleData", "Import Sample Data"),
      localize("sampleCollectionDescription", "Create a new collection using one of our sample datasets"),
      () => {
        ingestSampleMongoData(appContext, context, databaseDashboardInfo).then(
          () => refreshCollections && refreshCollections()
        );
        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.gettingStartedImportSampleData
        );
      }
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
  appContext: AppContext,
  databaseDashboardInfo: IDatabaseDashboardInfo
): Promise<azdata.Component> => {
  let collections: ICosmosDbCollectionInfo[];

  refreshCollections = () => {
    retrieveMongoDbCollectionsInfoFromArm(
      databaseDashboardInfo.azureAccount,
      databaseDashboardInfo.azureTenantId,
      databaseDashboardInfo.azureResourceId,
      getAccountNameFromOptions(databaseDashboardInfo),
      databaseName
    ).then((collectionsInfo) => {
      collections = collectionsInfo;
      tableComponent.data = collectionsInfo.map((collection) => [
        <azdata.HyperlinkColumnCellValue>{
          title: collection.name,
          icon: context.asAbsolutePath("resources/fluent/collection.svg"),
        },
        collection.usageSizeKB === undefined ? localize("unknown", "Unknown") : collection.usageSizeKB,
        collection.documentCount === undefined ? localize("unknown", "Unknown") : collection.documentCount,
        collection.shardKey === undefined ? "" : Object.keys(collection.shardKey)[0],
        <azdata.HyperlinkColumnCellValue>{
          title: collection.throughputSetting,
        },
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
          value: "collection",
          type: azdata.ColumnType.hyperlink,
          name: localize("collection", "Collection"),
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
          value: localize("shardKey", "Shard key"),
          type: azdata.ColumnType.text,
        },
        <azdata.HyperlinkColumn>{
          value: "throughput",
          type: azdata.ColumnType.hyperlink,
          name: localize("throughput", "Throughput"),
          width: 200,
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
    tableComponent.onCellAction(async (arg: any /* Bug with definition: ICellActionEventArgs */) => {
      if (arg.name === "collection") {
        // vscode.commands.executeCommand(
        //   "cosmosdb-ads-extension.openMongoShell",
        //   { ...databaseDashboardInfo },
        //   databaseDashboardInfo.databaseName
        // );
        vscode.commands.executeCommand(
          "cosmosdb-ads-extension.openQuery",
          { ...databaseDashboardInfo },
          databaseDashboardInfo.databaseName,
          collections[arg.row].name
        );

        appContext.reporter?.sendActionEvent(
          Telemetry.sources.databaseDashboard,
          Telemetry.actions.click,
          Telemetry.targets.databaseDashboard.collectionsListAzureOpenDashboard
        );
      } else if (arg.name === "throughput" && collections[arg.row].throughputSetting !== "") {
        try {
          const result = await changeMongoDbCollectionThroughput(
            databaseDashboardInfo.azureAccount,
            databaseDashboardInfo.azureTenantId,
            databaseDashboardInfo.azureResourceId,
            getAccountNameFromOptions(databaseDashboardInfo),
            databaseName,
            collections[arg.row]
          );
          if (result) {
            refreshCollections && refreshCollections();
          }
          appContext.reporter?.sendActionEvent(
            Telemetry.sources.databaseDashboard,
            Telemetry.actions.click,
            Telemetry.targets.databaseDashboard.collectionsListAzureChangeThroughput
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(e?.message);
        }
      }
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
      appContext.reporter?.sendActionEvent(
        Telemetry.sources.databaseDashboard,
        Telemetry.actions.click,
        Telemetry.targets.databaseDashboard.collectionsListNonAzureOpenDashboard
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

const buildBreadcrumb = (view: azdata.ModelView, accountName: string, databaseName: string): azdata.Component => {
  const CSSStyles = { marginTop: 0, marginBottom: 0 };
  const home = view.modelBuilder.text().withProps({ value: "Home", CSSStyles }).component();

  // TODO: left and right margins don't work on righArrow, and spaces are trimmed, so we use this for spacers
  const space1 = view.modelBuilder
    .text()
    .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
    .component();
  const rightArrow = view.modelBuilder.text().withProps({ value: ">", CSSStyles }).component();
  const space2 = view.modelBuilder
    .text()
    .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
    .component();

  const accountLink = view.modelBuilder.hyperlink().withProps({ label: accountName, url: "" }).component();
  const space3 = view.modelBuilder
    .text()
    .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
    .component();
  const rightArrow2 = view.modelBuilder.text().withProps({ value: ">", CSSStyles }).component();
  const space4 = view.modelBuilder
    .text()
    .withProps({ value: "_", CSSStyles: { ...CSSStyles, opacity: 0 } })
    .component();

  const database = view.modelBuilder.text().withProps({ value: databaseName, CSSStyles }).component();

  accountLink.onDidClick(async (_) => {
    openAccountDashboard(accountName);
  });

  return view.modelBuilder
    .flexContainer()
    .withItems([home, space1, rightArrow, space2, accountLink, space3, rightArrow2, space4, database], {
      flex: "0 0 auto",
      CSSStyles: { gap: 10, paddingRight: 10 },
    })
    .withLayout({ flexFlow: "row", flexWrap: "wrap", justifyContent: "flex-start" })
    .withProps({
      CSSStyles: {
        padding: "10px",
        "border-bottom": "1px solid rgba(128, 128, 128, 0.35)",
      },
    })
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
      ? await buildCollectionsAreaAzure(databaseName, view, context, appContext, databaseDashboardInfo)
      : await buildCollectionsAreaNonAzure(databaseName, view, context, appContext, databaseDashboardInfo);

    const homeTabContainer = view.modelBuilder
      .flexContainer()
      .withItems([
        buildBreadcrumb(view, databaseDashboardInfo.server, databaseName),
        buildToolbar(view, context, appContext, databaseDashboardInfo),
        buildWorkingWithDatabase(view, appContext, context, databaseDashboardInfo),
        viewItem,
      ])
      .withLayout({ flexFlow: "column" })
      .component();

    const homeTab: azdata.DashboardTab = {
      id: "home",
      // TODO depending on how breadcrumb is eventually exposed in ADS, we may have to uncomment this
      // toolbar: buildToolbar(view, context, appContext, databaseDashboardInfo),
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
