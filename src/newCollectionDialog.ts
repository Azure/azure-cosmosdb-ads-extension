import * as azdata from "azdata";
import * as vscode from "vscode";

/**
 *
 * @param view
 * @param isCreateNew true: create new database, false: use existing database
 */
const updateNewDatabaseFormItem = (
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
      .withProps({ checked: true, label: "Share throughput across collections" })
      .component();
    existingContainer.addItem(isSharedThroughput);
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

    const databaseThroughputRadioButtons: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([autoScaleRadioButton, manualThroughputRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    autoScaleRadioButton.onDidChangeCheckedState((isAutoSelect: boolean) => {
      if (isAutoSelect) {
        formBuilder.removeFormItem(manualThroughput);
        formBuilder.insertFormItem(autoscaleMaxThroughputFormItem, 3);
      } else {
        formBuilder.removeFormItem(autoscaleMaxThroughputFormItem);
        formBuilder.insertFormItem(manualThroughput, 3);
      }
    });

    const databaseThroughtputFormItem = {
      component: view.modelBuilder.divContainer().withItems([databaseThroughputRadioButtons]).component(),
      title: "Database Throughput (autoscale)",
      required: true,
    };

    const autoscaleMaxThroughputFormItem: azdata.FormComponent = {
      component: view.modelBuilder
        .inputBox()
        .withProps({
          required: true,
          multiline: false,
          value: "",
          placeHolder: "Database Max throughput",
          CSSStyles: { marginBottom: 20, paddingBottom: 20 },
        })
        .component(),
      title: "Database Max RU/s",
      required: true,
    };

    const manualThroughput: azdata.FormComponent = {
      component: view.modelBuilder
        .inputBox()
        .withProps({
          required: true,
          multiline: false,
          value: "",
          placeHolder: "Database required throughput",
          CSSStyles: { marginBottom: 20, paddingBottom: 20 },
        })
        .component(),
      title: "Database Required RU/s",
      required: true,
    };

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

    const createDatabaseRadioButtonsModel: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([createNewRadioButton, useExistingRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    useExistingRadioButton.onDidChangeCheckedState(async (state) => {
      updateNewDatabaseFormItem(view, databaseSectionContainer, !state);
      if (state) {
        formBuilder.removeFormItem(databaseThroughtputFormItem);
        formBuilder.removeFormItem(autoscaleMaxThroughputFormItem);
        formBuilder.removeFormItem(manualThroughput);
      } else {
        formBuilder.insertFormItem(databaseThroughtputFormItem, 2);
        if (autoScaleRadioButton.checked) {
          formBuilder.insertFormItem(autoscaleMaxThroughputFormItem, 3);
        } else {
          formBuilder.insertFormItem(manualThroughput, 3);
        }
      }
    });

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
        label: "Unsharded",
        value: "unsharded",
        checked: true,
      })
      .component();

    const collectionShardedRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "collectionSharding",
        label: "Sharded",
        value: "sharded",
        checked: false,
      })
      .component();

    const collectionShardingRadioButtons: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([collectionUnshardedRadioButton, collectionShardedRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    const shardKeyInputFormItem: azdata.FormComponent = {
      component: view.modelBuilder
        .inputBox()
        .withProps({
          required: true,
          multiline: false,
          value: "",
          placeHolder: "e.g. address.zipCode",
        })
        .component(),
      title: "Shard key",
    };

    collectionUnshardedRadioButton.onDidChangeCheckedState((isUnsharded: boolean) => {
      if (isUnsharded) {
        formBuilder.removeFormItem(shardKeyInputFormItem);
      } else {
        formBuilder.addFormItem(shardKeyInputFormItem); // Fortunately for now, we just add at the end
      }
    });

    const databaseNameFormItem: azdata.FormComponent = {
      component: view.modelBuilder
        .divContainer()
        .withItems([createDatabaseRadioButtonsModel, databaseSectionContainer])
        .component(),
      title: "Database Name", // localize('createSessionDialog.selectTemplates', "Select session template:")
      required: true,
    };

    const formBuilder = view.modelBuilder.formContainer().withFormItems([
      {
        components: [
          databaseNameFormItem,
          databaseThroughtputFormItem,
          autoscaleMaxThroughputFormItem,
          {
            component: view.modelBuilder
              .separator()
              .withProps({ CSSStyles: { marginTop: 20, paddingTop: 20 } })
              .component(),
            title: undefined,
          },
          {
            component: collectionNameInput,
            title: "Enter Collection name", // localize('createSessionDialog.selectTemplates', "Select session template:")
            required: true,
          },
          {
            component: collectionShardingRadioButtons,
            title: "Sharding", // localize('createSessionDialog.selectTemplates', "Select session template:")
            required: true,
          },
          {
            component: collectionShardingRadioButtons,
            title: undefined, // localize('createSessionDialog.selectTemplates', "Select session template:")
            required: true,
          },
        ],
        title: "",
      },
    ]);

    const formModel = formBuilder.withLayout({ width: "100%" }).component();

    // Initialization
    updateNewDatabaseFormItem(view, databaseSectionContainer, true);
    await view.initializeModel(formModel);
  });

  return dialog;
};
