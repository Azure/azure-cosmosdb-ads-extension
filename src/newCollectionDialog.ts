import * as azdata from "azdata";
import * as vscode from "vscode";

const updateDatabaseThroughputSection = (
  view: azdata.ModelView,
  existingContainer: azdata.DivContainer,
  isAutoscale: boolean
) => {
  existingContainer.clearItems();

  if (isAutoscale) {
    existingContainer.addItem(view.modelBuilder.text().withProps({ value: "Database Max RU/s" }).component());
    const databaseThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: "",
        placeHolder: "Database Max throughput",
        CSSStyles: { marginBottom: 20, paddingBottom: 20 },
      })
      .component();
    existingContainer.addItem(databaseThroughputInput);
  } else {
    existingContainer.addItem(view.modelBuilder.text().withProps({ value: "Required RU/s" }).component());
    const databaseThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: "",
        placeHolder: "Required throughput",
        CSSStyles: { marginBottom: 20, paddingBottom: 20 },
      })
      .component();
    existingContainer.addItem(databaseThroughputInput);
  }
};

/**
 *
 * @param view
 * @param isCreateNew true: create new database, false: use existing database
 */
const updateNewDatabaseSection = (
  view: azdata.ModelView,
  existingContainer: azdata.DivContainer,
  isCreateNew: boolean
) => {
  existingContainer.clearItems();

  if (isCreateNew) {
    // Create new database
    const newDatabaseNameInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: "",
        placeHolder: "Enter new database name",
      })
      .component();

    existingContainer.addItem(newDatabaseNameInput);

    const isSharedThroughput = view.modelBuilder
      .checkBox()
      .withProps({ enabled: true, label: "Share throughput across collections" })
      .component();
    existingContainer.addItem(isSharedThroughput);

    existingContainer.addItem(
      view.modelBuilder
        .text()
        .withProps({ value: "Database throughput (autoscale)", CSSStyles: { marginTop: 20 } })
        .component()
    );
    const autoScaleRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "databaseThroughput",
        label: "Autoscale",
        value: "autoscale",
        checked: true,
      })
      .component();

    const manualThroughputRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "databaseThroughput",
        label: "Manual",
        value: "manual",
        checked: false,
      })
      .component();

    let flexRadioButtonsModel: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([autoScaleRadioButton, manualThroughputRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    existingContainer.addItem(flexRadioButtonsModel);

    const databaseThroughputContainer = view.modelBuilder
      .divContainer()
      .withProps({
        CSSStyles: {
          padding: "0px",
        },
      })
      .component();

    existingContainer.addItem(databaseThroughputContainer);

    autoScaleRadioButton.onDidChangeCheckedState(async (state) =>
      updateDatabaseThroughputSection(view, databaseThroughputContainer, state)
    );
  } else {
    // Existing databases
    const databases = view.modelBuilder
      .dropDown()
      .withProps({
        values: ["database1", "database2"],
      })
      .component();
    existingContainer.addItem(databases);
  }

  existingContainer.addItem(
    view.modelBuilder
      .separator()
      .withProps({ CSSStyles: { marginTop: 20, paddingTop: 20 } })
      .component()
  );
};

const updateCollectionShardingSection = (
  view: azdata.ModelView,
  existingContainer: azdata.DivContainer,
  isSharded: boolean
) => {
  existingContainer.clearItems();

  if (isSharded) {
    const shardKeyInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: "",
        placeHolder: "Enter shard key",
      })
      .component();

    existingContainer.addItem(view.modelBuilder.text().withProps({ value: "Shard key" }).component());
    existingContainer.addItem(shardKeyInput);
  }
};

export const createNewCollectionDialog = async (): Promise<azdata.window.Dialog> => {
  const dialog = azdata.window.createModelViewDialog("New Collection");

  dialog.okButton.onClick((data) => {
    vscode.window.showInformationMessage("Ok pressed");
    console.log("onClick data:", data);
  });
  dialog.cancelButton.onClick(() => {});
  dialog.okButton.label = "Create";
  dialog.cancelButton.label = "Cancel";

  dialog.registerContent(async (view) => {
    let formBuilder: azdata.FormBuilder;

    const databaseNameText = view.modelBuilder.text().withProps({ value: "Database name" }).component();

    // Selection between create new or use existing database
    const createNewRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "createNewOrExisting",
        label: "Create New",
        value: "new",
        checked: true,
      })
      .component();

    const useExistingRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "createNewOrExisting",
        label: "Use existing",
        value: "existing",
        checked: false,
      })
      .component();

    let flexRadioButtonsModel: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([createNewRadioButton, useExistingRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    useExistingRadioButton.onDidChangeCheckedState(async (state) =>
      updateNewDatabaseSection(view, databaseSectionContainer, !state)
    );

    const databaseSectionContainer = view.modelBuilder
      .divContainer()
      .withProps({
        CSSStyles: {
          padding: "0px",
        },
      })
      .component();

    const collectionNameInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: "",
        placeHolder: "Enter new collection name",
      })
      .component();

    const collectionUnshardedRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "collectionSharding",
        label: "unsharded",
        value: "Unsharded",
        checked: true,
      })
      .component();

    const collectionShardedRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "collectionSharding",
        label: "sharded",
        value: "Sharded",
        checked: false,
      })
      .component();

    let flexRadioButtonsModel2: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([collectionUnshardedRadioButton, collectionShardedRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    const collectionShardingContainer = view.modelBuilder
      .divContainer()
      .withProps({
        CSSStyles: {
          padding: "0px",
        },
      })
      .component();

    collectionUnshardedRadioButton.onDidChangeCheckedState(async (state) =>
      updateCollectionShardingSection(view, collectionShardingContainer, !state)
    );

    formBuilder = view.modelBuilder.formContainer().withFormItems([
      {
        components: [
          {
            component: databaseNameText,
            title: undefined, // localize('createSessionDialog.selectTemplates', "Select session template:")
          },
          {
            component: flexRadioButtonsModel,
            title: undefined, // localize('createSessionDialog.selectTemplates', "Select session template:")
          },
          {
            component: databaseSectionContainer,
            title: undefined, // localize('createSessionDialog.selectTemplates', "Select session template:")
          },
          {
            component: collectionNameInput,
            title: "Enter Collection name", // localize('createSessionDialog.selectTemplates', "Select session template:")
          },
          {
            component: flexRadioButtonsModel2,
            title: "Sharding", // localize('createSessionDialog.selectTemplates', "Select session template:")
          },
          {
            component: collectionShardingContainer,
            title: undefined, // localize('createSessionDialog.selectTemplates', "Select session template:")
          },
        ],
        title: "",
      },
    ]);

    const formModel = formBuilder.withLayout({ width: "100%" }).component();

    // Initialization
    updateNewDatabaseSection(view, databaseSectionContainer, true);
    updateCollectionShardingSection(view, collectionShardingContainer, false);
    await view.initializeModel(formModel);
  });

  return dialog;
};
