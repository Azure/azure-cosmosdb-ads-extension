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

/** From @microsoft/ads-service-downloader
 * Events does not exist in the compiled javascript and is only defined in .d.ts. The strings are hardcoded in the javascript code.
 * esbuild does not bundle d.ts definitions
 */
export const enum Events {
  /**
   * Download start, data will be downloading url and size of the download in bytes
   */
  DOWNLOAD_START = "download_start",
  /**
   * Download progress event, data will be the current progress of the download
   */
  DOWNLOAD_PROGRESS = "download_progress",
  /**
   * Download end
   */
  DOWNLOAD_END = "download_end",
  /**
   * Install Start, data will be install directory
   */
  INSTALL_START = "install_start",
  /**
   * Entry extracted from downloaded archive.
   * Data :
   *  0 : Path to file/folder
   *  1 : Entry number
   *  2 : Total number of entries
   */
  ENTRY_EXTRACTED = "entry_extracted",
  /**
   * Install End
   */
  INSTALL_END = "install_end",
  /**
   * When log is emitted.
   * Event arguments:
   * 1. Log Level
   * 2. Message
   */
  LOG_EMITTED = "log_emitted",
}
