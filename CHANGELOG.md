# Change Log
## [0.1.0] - 5/19/22
### Initial release

## [0.1.1] - 6/02/22
### Bug fixes
* Create collection or database updates the dashboard
* Upload sample data updates dashboard and connection tree
* Clicking on collection in dashboard opens mongoshell
* Allow multiple mongo shells open per account

## [0.1.2] - 7/18/22
### New changes
* Allow multiple mongoshell on same account or database
* Add Telemetry using ADS ai key
* Add ability to change throughput for CosmosDB collections by clicking on table in dashboard
* more error handling
* Add ability to change datababase scale settings
* Make delete database or collection consistent with portal experience: must type name to delete
### Bug fixes
* Restrict dashboard to COSMOSDB_MONGO provider

## [0.1.3] - 9/15/2022
### New changes
* Add a New Database and New Collection dialogs in order to allow user to input Cosmos DB-specific parameters such as Throughput, or Shard Key
* Breadcrumb in database dashboard
* Rename sample data collection from to "Customer Data". Properly create sharded collection
* For CosmosDB account, display throughput and shard key information in the dashboards
### Bug fixes
* Fix github ci (thanks JoeCalvert!)
* Fix bug: mistyping collection name when deleting collection fails silently

## [0.1.4] - 11/01/2022
### Bug fixes
* Fix "Basic" authentication. Also made it work for CosmosDB accounts.

## [0.2.0] - 1/9/2023
### New changes
* Update AI key for telemetry
* Remove binaries from extension. The extension now downloads them from github release when needed.

## [0.2.1] - 2/20/2023
### Bug fixes
* Connection provider : getConnectionString implementation (Thanks Bharath Palaksha)
* Upgrade ads telemetry and downlaoder dependencies

## [0.3.0] - 3/24/2023
### New changes
* Update README section: Add telemetry section and update privacy statement with latest approved wording
* Switch unit test to using `azdata-test` package
* Add `.editorconfig` defining our own indent style
* Update NOTICES
### Bug fixes
* Handle connection string parsing errors
* Fix connecting to a Mongo vCore cluster

## [0.3.1] - 3/27/2023
### Bug fixes
* Fix getConnectionString in connection provider for multiple connections

## [0.3.3] - 5/9/2023

### New changes
* Double-clicking on collection node opens dashboard
* Add esbuild bundler
* Display connection error to user
* Alpha sort databases and collections when displayed in tree or dashboards
* Add License section to README
* Improve vCore auth handling and dashboards
### Bug fixes
* Fix Mongo Shell executable flag on *NIX
* Fix issue with Mongo Shell called from tree ([#71](https://github.com/Azure/azure-cosmosdb-ads-extension/issues))

## [0.3.4] - 5/22/2023
### New changes
* Move "Mongo Cluster" checkbox to main connection dialog (out of "Advanced") in "Parameters" view of new connection dialog
* Improve connection logic and error messages in new connection flow to handle opening with URI

## [0.3.5] - 7/27/2023
### New changes
* Allow connecting to passwordless servers

## [0.3.6] - 8/9/2023
### New changes
* Upgrade eslint
* Upgrade to node 16 in ci
### Bug fixes
* Fix issue with "Overview" section of Manage Account not updating (constant spinner)

## [0.4.0] - 11/22/2023
### New changes
* Add NoSQL API support: Query Editor, .NET C# proxy to execute the queries, new Dashboards
* Make Mongo sample data import cancelable
* Add progress indicator when importing data

### Bug fixes
* Fix import sample data for Mongo

## [0.4.1] - 1/8/2024
### New changes
* Add support for Ubuntu 22 for mongo shell install
* Update user-agent suffix for proxy

## [0.4.2] - 1/19/2024
### New changes
* Add query editor to Mongo DB and Cosmos DB for Mongo accounts
