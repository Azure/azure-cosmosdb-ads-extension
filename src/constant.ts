export const COSMOSDB_DOC_URL = "https://docs.microsoft.com/azure/cosmos-db/introduction";
export const LOCAL_RESOURCES_DIR = "local-resources";

export const Telemetry = {
  actions: {
    click: "Click",
    expand: "Expand",
  },
  sources: {
    homeDashboard: "homeDashboard",
    databaseDashboard: "databaseDashboard",
    objectExplorerNodeProvider: "objectExplorerNodeProvider",
  },
  targets: {
    homeDashboard: {
      toolbarNewDatabase: "Toolbar/NewDatabase",
      toolbarOpenMongoShell: "Toolbar/OpenMongoShell",
      toolbarRefresh: "Toolbar/Refresh",
      toolbarLearnMore: "Toolbar/LearnMore",
      gettingStartedNewDatabase: "GettingStarted/NewDatabase",
      gettingStartedOpenMongoShell: "GettingStarted/OpenMongoShell",
      gettingStartedDocumentation: "GettingStarted/Documentation",
      gettingStartedOpenInPortal: "GettingStarted/OpenInPortal",
      databasesListAzureOpenDashboard: "databasesListAzure/OpenDashboard",
      databasesListAzureChangeThroughput: "databasesListAzure/ChangeThroughput",
      databasesListNonAzureOpenDashboard: "databasesListNonAzure/OpenDashboard",
    },
    databaseDashboard: {
      toolbarNewCollection: "Toolbar/NewCollection",
      toolbarOpenMongoShell: "Toolbar/OpenMongoShell",
      toolbarRefresh: "Toolbar/Refresh",
      gettingStartedNewCollection: "GettingStarted/NewCollection",
      gettingStartedImportSampleData: "GettingStarted/ImportSampleData",
      collectionsListAzureOpenDashboard: "collectionsListAzure/OpenDashboard",
      collectionsListAzureChangeThroughput: "collectionsListAzure/ChangeThroughput",
      collectionsListNonAzureOpenDashboard: "collectionsListNonAzure/OpenDashboard",
    },
    objectExplorerNodeProvider: {
      accountNode: "accountNode",
      databaseNode: "databaseNode",
      collectionNode: "collectionNode",
    },
  },
};
