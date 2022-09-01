import * as azdata from "azdata";

export interface NewCollectionFormData {
  isCreateNewDatabase: boolean;
  existingDatabaseId: string;
  newDatabaseInfo: NewDatabaseFormData;
  newCollectionName: string;
  isSharded: boolean;
  shardKey: string | undefined;
}

export interface NewDatabaseFormData {
  newDatabaseName: string;
  isShareDatabaseThroughput: boolean;
  isAutoScale: boolean;
  databaseMaxThroughputRUPS: number;
  databaseRequiredThroughputRUPS: number;
}

const DEFAULT_NEW_DATABASE_NAME = "";
const DEFAULT_IS_SHARED_DATABASE_THROUGHPUT = true;
const DEFAULT_IS_AUTOSCALE = true;
const DEFAULT_DATABASE_MAX_THROUGHPUT_RUPS = 4000;
const DEFAULT_DATABASE_REQUIRED_RUPS = 400;
const DEFAULT_NEW_COLLECTION_NAME = "";
const DEFAULT_IS_SHARDED = false;
const DEFAULT_SHARD_KEY = "";

export const createNewDatabaseDialog = async (
  onCreateClick: (data: NewDatabaseFormData) => void,
  databaseName?: string
): Promise<azdata.window.Dialog> => {
  const dialog = azdata.window.createModelViewDialog("New Database");

  const model: NewDatabaseFormData = {
    newDatabaseName: DEFAULT_NEW_DATABASE_NAME,
    isShareDatabaseThroughput: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT,
    isAutoScale: DEFAULT_IS_AUTOSCALE,
    databaseMaxThroughputRUPS: DEFAULT_DATABASE_MAX_THROUGHPUT_RUPS,
    databaseRequiredThroughputRUPS: DEFAULT_DATABASE_REQUIRED_RUPS,
  };

  dialog.okButton.onClick(() => onCreateClick(model));
  dialog.cancelButton.onClick(() => {});
  dialog.okButton.label = "Create";
  dialog.cancelButton.label = "Cancel";

  dialog.registerContent(async (view) => {
    // Create new database
    const newDatabaseNameInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: databaseName ?? DEFAULT_NEW_DATABASE_NAME,
        placeHolder: "Enter new database name",
      })
      .component();
    newDatabaseNameInput.onTextChanged((text) => (model.newDatabaseName = text));

    const isSharedThroughput = view.modelBuilder
      .checkBox()
      .withProps({ checked: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT, label: "Share throughput across collections" })
      .component();
    isSharedThroughput.onChanged((isSharedThroughput) => (model.isShareDatabaseThroughput = isSharedThroughput));

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
        label: "Manual (400 - unlimited RU/s)",
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
      model.isAutoScale = isAutoScale;

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
      title: "Database Throughput",
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
      (text) => !isNaN(text) && (model.databaseMaxThroughputRUPS = Number.parseInt(text))
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
      (text) => !isNaN(text) && (model.databaseRequiredThroughputRUPS = Number.parseInt(text))
    );

    const manualThroughputFormItem: azdata.FormComponent = {
      component: manualThroughputInput,
      title: "Database Required RU/s",
      required: true,
    };

    const formBuilder = view.modelBuilder.formContainer();
    formBuilder.addFormItem(
      {
        component: newDatabaseNameInput,
        title: "Database Id",
      },
      {
        titleFontSize: 14,
        info: "A database is analogous to a namespace. It is the unit of management for a set of collections.",
      }
    );

    formBuilder.addFormItem(
      {
        component: isSharedThroughput,
        title: "Provision throughput",
      },
      {
        titleFontSize: 14,
        info: "Throughput configured at the database level will be shared across all collections within the database.",
      }
    );

    formBuilder.addFormItem(databaseThroughtputFormItem, {
      titleFontSize: 14,
      info: "Set the throughput — Request Units per second (RU/s) — required for the workload. A read of a 1 KB document uses 1 RU. Select manual if you plan to scale RU/s yourself. Select autoscale to allow the system to scale RU/s based on usage.",
    });

    formBuilder.addFormItem(autoscaleMaxThroughputFormItem, { titleFontSize: 14, info: "" });

    const formModel = formBuilder.withLayout({ width: "100%" }).component();

    await view.initializeModel(formModel);
  });

  return dialog;
};

export const createNewCollectionDialog = async (
  onCreateClick: (data: NewCollectionFormData) => void,
  existingDatabaseIds: string[],
  databaseName?: string,
  collectionName?: string
): Promise<azdata.window.Dialog> => {
  const dialog = azdata.window.createModelViewDialog("New Collection");

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
    newCollectionName: collectionName ?? DEFAULT_NEW_COLLECTION_NAME,
    isSharded: DEFAULT_IS_SHARDED,
    shardKey: DEFAULT_SHARD_KEY,
  };

  // If the provided databaseName exists already, we're not creating a new database
  if (databaseName) {
    model.isCreateNewDatabase = existingDatabaseIds.indexOf(databaseName) === -1;
    if (model.isCreateNewDatabase) {
      model.newDatabaseInfo.newDatabaseName;
    } else {
      model.existingDatabaseId = databaseName;
    }
  }

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
        existingContainer.addItem(existingDatabaseIdsDropdown);
      }
    };

    // Create new database
    const newDatabaseNameInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: databaseName ?? DEFAULT_NEW_DATABASE_NAME,
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

    const existingDatabaseIdsDropdown = view.modelBuilder
      .dropDown()
      .withProps({
        values: existingDatabaseIds,
      })
      .component();
    existingDatabaseIdsDropdown.onValueChanged((databaseId) => (model.existingDatabaseId = databaseId.selected));
    if (!model.isCreateNewDatabase) {
      existingDatabaseIdsDropdown.value = model.existingDatabaseId;
    }

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
        label: "Manual (400 - unlimited RU/s)",
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
      title: "Database Throughput",
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
        checked: model.isCreateNewDatabase,
      })
      .component();

    const useExistingRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "createNewOrExisting",
        label: "Use existing",
        value: "existing",
        checked: !model.isCreateNewDatabase,
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
        value: collectionName && DEFAULT_NEW_COLLECTION_NAME,
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

    const formBuilder = view.modelBuilder.formContainer().withFormItems(
      [
        {
          components: [databaseNameFormItem, databaseThroughtputFormItem, autoscaleMaxThroughputFormItem],
          title: "",
        },
        {
          component: view.modelBuilder.separator().component(),
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
      { titleFontSize: 14 }
    );

    const formModel = formBuilder.withLayout({ width: "100%" }).component();

    // Initialization
    updateNewDatabaseFormItem(databaseSectionContainer, model.isCreateNewDatabase);
    await view.initializeModel(formModel);
  });

  return dialog;
};
