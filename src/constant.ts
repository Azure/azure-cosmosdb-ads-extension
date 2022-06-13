export const COSMOSDB_DOC_URL = "https://docs.microsoft.com/azure/cosmos-db/introduction";

export const Telemetry = {
  // all events will be prefixed with this event name
  extensionId: "azure-cosmosdb-ads-extension",
  // extension version will be reported as a property with each event
  extensionVersion: "0.1.1",
  // the application insights key (also known as instrumentation key)
  instrumentationKey: "_add_key_here",

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
      databasesListAzure: "databasesListAzure",
      databasesListNonAzure: "databasesListNonAzure",
    },
    databaseDashboard: {
      toolbarNewCollection: "Toolbar/NewCollection",
      toolbarOpenMongoShell: "Toolbar/OpenMongoShell",
      toolbarRefresh: "Toolbar/Refresh",
      gettingStartedNewCollection: "GettingStarted/NewCollection",
      gettingStartedImportSampleData: "GettingStarted/ImportSampleData",
      collectionsListAzure: "collectionsListAzure",
      collectionsListNonAzure: "collectionsListNonAzure",
    },
    objectExplorerNodeProvider: {
      accountNode: "accountNode",
      databaseNode: "databaseNode",
      collectionNode: "collectionNode",
    },
  },
};
