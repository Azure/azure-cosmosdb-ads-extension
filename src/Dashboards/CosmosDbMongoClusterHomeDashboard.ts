/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from "azdata";
import * as vscode from "vscode";
import * as nls from "vscode-nls";
import { MongoService } from "../Services/MongoService";
import { AbstractArmService } from "../Services/AbstractArmService";
import TelemetryReporter from "@microsoft/ads-extension-telemetry";
import { NativeMongoHomeDashboard } from "./NativeMongoHomeDashboard";
import { AbstractAzureCosmosDbHomeDashboard } from "./AbstractCosmosDbHomeDashboard";

const localize = nls.loadMessageBundle();

export class CosmosDbMongoClusterHomeDashboard extends NativeMongoHomeDashboard {
  constructor(reporter: TelemetryReporter, mongoService: MongoService, private armService: AbstractArmService) {
    super(reporter, mongoService);
  }

  protected createModelViewItems(view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component[] {
    const viewItems: azdata.Component[] = [this.buildOverview(view)];
    return viewItems.concat(super.createModelViewItems(view, context));
  }

  private buildOverview(view: azdata.ModelView): azdata.Component {
    this.refreshProperties = () => {
      const connectionInfo = view.connection;
      this.armService
        .retrieveClusterInfo(
          connectionInfo.options["azureAccount"],
          connectionInfo.options["azureTenantId"],
          connectionInfo.options["azureResourceId"],
          this.armService.getAccountName(connectionInfo)
        )
        .then((mongoClusterInfo) => {
          const propertyItems: azdata.PropertiesContainerItem[] = [
            {
              displayName: localize("status", "Status"),
              value: mongoClusterInfo.provisioningStatus + ", " + mongoClusterInfo.clusterStatus,
            },
            {
              displayName: localize("mongoVersion", "Mongo DB Version"),
              value: mongoClusterInfo.serverVersion,
            },
            {
              displayName: localize("location", "Location"),
              value: mongoClusterInfo.location,
            },
          ];

          properties.propertyItems = propertyItems;
          component.loading = false;
        });
    };
    this.refreshProperties();

    const propertyItems: azdata.PropertiesContainerItem[] = [];
    const properties = view.modelBuilder.propertiesContainer().withProps({ propertyItems }).component();

    const overview = view.modelBuilder
      .divContainer()
      .withItems([properties])
      .withProps({
        CSSStyles: {
          padding: "10px",
          "border-bottom": "1px solid rgba(128, 128, 128, 0.35)",
        },
      })
      .component();

    const component = view.modelBuilder
      .loadingComponent()
      .withItem(overview)
      .withProps({
        loading: true,
      })
      .component();

    return component;
  }

  protected createGettingStartedDefaultButtons(
    view: azdata.ModelView,
    context: vscode.ExtensionContext
  ): azdata.ButtonComponent[] {
    let heroCardsContainer = super.createGettingStartedDefaultButtons(view, context);
    heroCardsContainer.push(
      AbstractAzureCosmosDbHomeDashboard.createOpenInPortalButton(view, context, this.reporter, this.armService)
    );
    return heroCardsContainer;
  }
}
