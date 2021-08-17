/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import * as vscode from 'vscode';

interface IButtonData {
  label: string;
  icon?: string;
  onClick?: () => void;
}

const buildToolbar = (view: azdata.ModelView, context: vscode.ExtensionContext): azdata.ToolbarContainer => {
  const buttons: azdata.ButtonProperties[] = [
    {
      label: 'New Database',
      iconPath: {
				light: context.asAbsolutePath('images/AddDatabase.svg'),
				dark: context.asAbsolutePath('images/AddDatabase.svg')
			}
    },
    {
      label: 'Open Mongo Shell',
      iconPath: {
				light: context.asAbsolutePath('images/Hosted-Terminal.svg'),
				dark: context.asAbsolutePath('images/Hosted-Terminal.svg')
			}
    },
    {
      label: 'Refresh',
      iconPath: {
				light: context.asAbsolutePath('images/refresh-cosmos.svg'),
				dark: context.asAbsolutePath('images/refresh-cosmos.svg')
			}
    },
    {
      label: 'Learn more',
      iconPath: {
				light: context.asAbsolutePath('images/Info.svg'),
				dark: context.asAbsolutePath('images/Info.svg')
			}
    }
  ];
  const navElements: azdata.ButtonComponent[] = buttons.map(b => 
    view.modelBuilder.button().withProps(b).component());
	return view.modelBuilder.toolbarContainer().withItems(navElements)
    .withLayout({ orientation: azdata.Orientation.Horizontal })
    .component();
};

const buildOverview = (view: azdata.ModelView): azdata.Component => {
  const propertyItems: azdata.PropertiesContainerItem[] = [
    {
      displayName: 'Status',
      value: 'Online'
    },
    {
      displayName: 'Backup policy',
      value: 'Periodic'
    },
    {
      displayName: 'Capacity mode',
      value: 'Provisioned throughput'
    },
    {
      displayName: 'Read location',
      value: 'West US'
    }
  ];

  const properties = view.modelBuilder.propertiesContainer().withProps({ propertyItems }).component();
  return view.modelBuilder.divContainer().withItems([properties]).withProps({
    CSSStyles: {
      padding: '10px',
      'border-bottom': '1px solid rgba(128, 128, 128, 0.35)'
    }
  }).component();
};

const buildHeroCard = (view: azdata.ModelView, iconPath: string, title: string, description: string, onClick?: () => void): azdata.ButtonComponent => {
  return view.modelBuilder.button().withProperties<azdata.ButtonProperties>({
    buttonType: azdata.ButtonType.Informational,
    description,
    height: 84,
    iconHeight: 32,
    iconPath,
    iconWidth: 32,
    label: title,
    title,
    width: 236
  }).component();
};

const buildGettingStarted = (view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component => {
  const heroCards: azdata.ButtonComponent[] = [
    buildHeroCard(view,context.asAbsolutePath('images/AddDatabase.svg'), 'New Database', 'Create database to store you data'),
    buildHeroCard(view,context.asAbsolutePath('images/Hosted-Terminal.svg'), 'Mongo shell', 'Interact with data using Mongo\'s'),
    buildHeroCard(view,context.asAbsolutePath('images/azure.svg'), 'Open in portal', 'View and manage this account (e.g. backup settings) in Azure portal'),
    buildHeroCard(view,context.asAbsolutePath('images/Info.svg'), 'Documentation', 'Find quickstarts, how-to guides, and references.')
  ];

  const heroCardsContainer = view.modelBuilder.flexContainer().withItems(heroCards)
    .withLayout({ flexFlow: 'row', flexWrap: 'wrap' }).withProps({ CSSStyles: { width: '100%' }}).component();

  return view.modelBuilder.flexContainer().withItems([
    view.modelBuilder.text().withProps({ 
      value: 'Getting started', 
      CSSStyles: { 'font-family': '20px', 'font-weight': '600' }
    }).component(),
    heroCardsContainer
  ]).withLayout({ flexFlow: 'column' }).withProps({
    CSSStyles: {
      padding: '10px'
    }
  }).component();
};

const buildTabArea = (view: azdata.ModelView, context: vscode.ExtensionContext): azdata.Component => {
  const input2 = view.modelBuilder.inputBox().withProperties<azdata.InputBoxProperties>({ value: 'input 2' }).component();

  const tabs: azdata.Tab[] = [
    {
      id: 'tab1',
      content: buildGettingStarted(view, context),
      title: 'Getting started'
    },
    {
      id: 'tab2',
      content: input2,
      title: 'Monitoring'
    }
  ];
  return view.modelBuilder.tabbedPanel().withTabs(tabs)
    .withLayout({ orientation: azdata.TabOrientation.Horizontal })
    .withProps({
      CSSStyles: {
        'height': '200px'
      }
    })
    .component();
};


export const openModelViewDashboard = async (context: vscode.ExtensionContext): Promise<void> => {
	const dashboard = azdata.window.createModelViewDashboard('languye-mongo');
	dashboard.registerTabs(async (view: azdata.ModelView) => {
		// Tab with toolbar
		const button = view.modelBuilder.button().withProperties<azdata.ButtonProperties>({
			label: 'Add databases tab',
			iconPath: {
				light: context.asAbsolutePath('images/compare.svg'),
				dark: context.asAbsolutePath('images/compare-inverse.svg')
			}
		}).component();

		const toolbar = view.modelBuilder.toolbarContainer().withItems([button]).withLayout({
			orientation: azdata.Orientation.Horizontal
		}).component();

		const input1 = view.modelBuilder.inputBox().withProperties<azdata.InputBoxProperties>({ value: 'input 1' }).component();
		

		// const cards: azdata.RadioCard[] = [
		// 	{
		// 		id: 'card1',
		// 		descriptions: [{ textValue: 'description11'}, { textValue: 'description12'}],
		// 		icon: context.asAbsolutePath('images/CosmosDB_20170524.svg')
		// 	},
		// 	{
		// 		id: 'card2',
		// 		descriptions: [{ textValue: 'description21'}, { textValue: 'description22'}],
		// 		icon: context.asAbsolutePath('images/CosmosDB_20170524.svg')
		// 	},
		// ];
		// const radioCardGroup = view.modelBuilder.radioCardGroup()
		// 	.withProps({
		// 		cards,
		// 		iconHeight: '100px',
		// 		iconWidth: '100px',
		// 		cardWidth: '170px',
		// 		cardHeight: '170px',
		// 		ariaLabel: 'test',
		// 		selectedCardId: 'card1'
		// 	}).component();

		const homeTabContainer = view.modelBuilder.flexContainer().withItems([
      buildOverview(view),
      buildTabArea(view, context)
		]).withLayout({ flexFlow: 'column' }).component();

		const homeTab: azdata.DashboardTab = {
			id: 'home',
			toolbar: buildToolbar(view, context),
			content: homeTabContainer,
			title: 'Home',
			icon: context.asAbsolutePath('images/home.svg') // icon can be the path of a svg file
		};
		
		const databasesTab: azdata.DashboardTab = {
			id: 'databases',
			toolbar: toolbar,
			content: input1,
			title: 'Databases',
			icon: context.asAbsolutePath('images/CosmosDB_20170524.svg') // icon can be the path of a svg file
		};

		return [
			homeTab,
			databasesTab
		];
	});
	await dashboard.open();
};


export const registerSqlServicesModelView = (): void => {
  azdata.ui.registerModelViewProvider('sqlservices', async (view) => {
    let flexModel = view.modelBuilder.flexContainer()
      .withLayout({
        flexFlow: 'row',
        alignItems: 'center'
      }).withItems([
        // 1st child panel with N cards
        view.modelBuilder.flexContainer()
          .withLayout({
            flexFlow: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          })
          .withItems([
            view.modelBuilder.card()
              .withProperties<azdata.CardProperties>({
                label: 'label1',
                value: 'value1',
                actions: [{ label: 'action' }]
              })
              .component()
          ]).component(),
        // 2nd child panel with N cards
        view.modelBuilder.flexContainer()
          .withLayout({ flexFlow: 'column' })
          .withItems([
            view.modelBuilder.card()
              .withProperties<azdata.CardProperties>({
                label: 'label2',
                value: 'value2',
                actions: [{ label: 'action' }]
              })
              .component()
          ]).component()
      ], { flex: '1 1 50%' })
      .component();
    await view.initializeModel(flexModel);
  });
}
