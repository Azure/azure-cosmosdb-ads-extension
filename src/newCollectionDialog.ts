import * as azdata from "azdata";

export interface NewCollectionFormData {
  isCreateNewDatabase: boolean;
  existingDatabaseId: string;
  newDatabaseInfo: {
    newDatabaseName: string;
    isShareDatabaseThroughput: boolean;
    isAutoScale: boolean;
    databaseMaxThroughputRUPS: number;
    databaseRequiredThroughputRUPS: number;
  };

  newCollectionName: string;
  isSharded: boolean;
  shardKey: string | undefined;
}

export const createNewCollectionDialog = async (
  onCreateClick: (data: NewCollectionFormData) => void
): Promise<azdata.window.Dialog> => {
  const dialog = azdata.window.createModelViewDialog("New Collection");

  const DEFAULT_NEW_DATABASE_NAME = "";
  const DEFAULT_IS_SHARED_DATABASE_THROUGHPUT = true;
  const DEFAULT_IS_AUTOSCALE = true;
  const DEFAULT_DATABASE_MAX_THROUGHPUT_RUPS = 4000;
  const DEFAULT_DATABASE_REQUIRED_RUPS = 400;
  const DEFAULT_NEW_COLLECTION_NAME = "";
  const DEFAULT_IS_SHARDED = false;
  const DEFAULT_SHARD_KEY = "";

  const model: NewCollectionFormData = {
    isCreateNewDatabase: true,
    existingDatabaseId: "",
    newDatabaseInfo: {
      newDatabaseName: DEFAULT_NEW_DATABASE_NAME,
      isShareDatabaseThroughput: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT,
      isAutoScale: DEFAULT_IS_AUTOSCALE,
      databaseMaxThroughputRUPS: DEFAULT_DATABASE_MAX_THROUGHPUT_RUPS,
      databaseRequiredThroughputRUPS: DEFAULT_DATABASE_REQUIRED_RUPS,
    },
    newCollectionName: DEFAULT_NEW_COLLECTION_NAME,
    isSharded: DEFAULT_IS_SHARDED,
    shardKey: DEFAULT_SHARD_KEY,
  };

  dialog.okButton.onClick(() => onCreateClick(model));
  dialog.cancelButton.onClick(() => {});
  dialog.okButton.label = "Create";
  dialog.cancelButton.label = "Cancel";

  dialog.registerContent(async (view) => {
    /**
     *
     * @param view
     * @param isCreateNew true: create new database, false: use existing database
     */
    const updateNewDatabaseFormItem = (existingContainer: azdata.DivContainer, isCreateNew: boolean) => {
      existingContainer.clearItems();

      if (isCreateNew) {
        existingContainer.addItem(newDatabaseNameInput);
        existingContainer.addItem(isSharedThroughput);
      } else {
        existingContainer.addItem(existingDatabaseIds);
      }
    };

    // Create new database
    const newDatabaseNameInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: DEFAULT_NEW_DATABASE_NAME,
        placeHolder: "Enter new database name",
      })
      .component();
    newDatabaseNameInput.onTextChanged((text) => (model.newDatabaseInfo.newDatabaseName = text));

    const isSharedThroughput = view.modelBuilder
      .checkBox()
      .withProps({ checked: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT, label: "Share throughput across collections" })
      .component();
    isSharedThroughput.onChanged(
      (isSharedThroughput) => (model.newDatabaseInfo.isShareDatabaseThroughput = isSharedThroughput)
    );

    const existingDatabaseIds = view.modelBuilder
      .dropDown()
      .withProps({
        values: ["database1", "database2"],
      })
      .component();
    existingDatabaseIds.onValueChanged((databaseId) => (model.existingDatabaseId = databaseId));

    const autoScaleRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "databaseThroughput",
        label: "Autoscale",
        value: "autoscale",
        checked: DEFAULT_IS_AUTOSCALE,
      })
      .component();

    const manualThroughputRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "databaseThroughput",
        label: "Manual",
        value: "manual",
        checked: !DEFAULT_IS_AUTOSCALE,
      })
      .component();

    const databaseThroughputRadioButtons: azdata.FlexContainer = view.modelBuilder
      .flexContainer()
      .withLayout({ flexFlow: "row" })
      .withItems([autoScaleRadioButton, manualThroughputRadioButton])
      .withProps({ ariaRole: "radiogroup" })
      .component();

    autoScaleRadioButton.onDidChangeCheckedState((isAutoScale: boolean) => {
      model.newDatabaseInfo && (model.newDatabaseInfo.isAutoScale = isAutoScale);

      if (isAutoScale) {
        formBuilder.removeFormItem(manualThroughputFormItem);
        formBuilder.insertFormItem(autoscaleMaxThroughputFormItem, 3);
      } else {
        formBuilder.removeFormItem(autoscaleMaxThroughputFormItem);
        formBuilder.insertFormItem(manualThroughputFormItem, 3);
      }
    });

    const databaseThroughtputFormItem = {
      component: view.modelBuilder.divContainer().withItems([databaseThroughputRadioButtons]).component(),
      title: "Database Throughput (autoscale)",
      required: true,
    };

    const autoscaleMaxThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: DEFAULT_DATABASE_MAX_THROUGHPUT_RUPS.toString(),
        placeHolder: "Database Max throughput",
      })
      .component();
    autoscaleMaxThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.newDatabaseInfo.databaseMaxThroughputRUPS = Number.parseInt(text))
    );

    const autoscaleMaxThroughputFormItem: azdata.FormComponent = {
      component: autoscaleMaxThroughputInput,
      title: "Database Max RU/s",
      required: true,
    };

    const manualThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: DEFAULT_DATABASE_REQUIRED_RUPS.toString(),
        placeHolder: "Database required throughput",
      })
      .component();
    manualThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.newDatabaseInfo.databaseRequiredThroughputRUPS = Number.parseInt(text))
    );

    const manualThroughputFormItem: azdata.FormComponent = {
      component: manualThroughputInput,
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
      model.isCreateNewDatabase = !state;
      updateNewDatabaseFormItem(databaseSectionContainer, !state);
      if (state) {
        formBuilder.removeFormItem(databaseThroughtputFormItem);
        formBuilder.removeFormItem(autoscaleMaxThroughputFormItem);
        formBuilder.removeFormItem(manualThroughputFormItem);
      } else {
        formBuilder.insertFormItem(databaseThroughtputFormItem, 2);
        if (autoScaleRadioButton.checked) {
          formBuilder.insertFormItem(autoscaleMaxThroughputFormItem, 3);
        } else {
          formBuilder.insertFormItem(manualThroughputFormItem, 3);
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
        value: DEFAULT_NEW_COLLECTION_NAME,
        placeHolder: "Enter new collection name",
      })
      .component();
    collectionNameInput.onTextChanged((text) => (model.newCollectionName = text));

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

    collectionUnshardedRadioButton.onDidChangeCheckedState((isUnsharded: boolean) => {
      model.isSharded = !isUnsharded;

      if (isUnsharded) {
        formBuilder.removeFormItem(shardKeyInputFormItem);
      } else {
        formBuilder.addFormItem(shardKeyInputFormItem); // Fortunately for now, we just add at the end
      }
    });

    const shardKeyInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: "",
        placeHolder: "e.g. address.zipCode",
      })
      .component();
    shardKeyInput.onTextChanged((text) => (model.shardKey = text));

    const shardKeyInputFormItem: azdata.FormComponent = {
      component: shardKeyInput,
      title: "Shard key",
    };

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
    updateNewDatabaseFormItem(databaseSectionContainer, true);
    await view.initializeModel(formModel);
  });

  return dialog;
};
