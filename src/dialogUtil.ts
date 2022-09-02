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
      } else {
        existingContainer.addItem(existingDatabaseIdsDropdown);
      }
    };

    const createRadioButtonsFormItem = (
      groupName: string,
      option1Label: string,
      option2Label: string,
      isOption1Checked: boolean,
      onOption1ChangeCheckState: (isChecked: boolean) => void,
      title: string
    ): azdata.FormComponent => {
      const option1RadioButton = view.modelBuilder
        .radioButton()
        .withProps({
          name: groupName,
          label: option1Label,
          value: option1Label,
          checked: isOption1Checked,
        })
        .component();

      option1RadioButton.onDidChangeCheckedState(onOption1ChangeCheckState);

      const option2RadioButton = view.modelBuilder
        .radioButton()
        .withProps({
          name: groupName,
          label: option2Label,
          value: option2Label,
          checked: !isOption1Checked,
        })
        .component();

      const radioButtonsContainer: azdata.FlexContainer = view.modelBuilder
        .flexContainer()
        .withLayout({ flexFlow: "row" })
        .withItems([option1RadioButton, option2RadioButton])
        .withProps({ ariaRole: "radiogroup" })
        .component();

      return {
        component: radioButtonsContainer,
        title,
        required: true,
      };
    };

    const renderModel = () => {
      // Clear form
      try {
        formBuilder.removeFormItem(databaseNameFormItem);
        formBuilder.removeFormItem(isSharedThroughputFormItem);
        formBuilder.removeFormItem(databaseThroughputRadioButtonsFormItem);
        formBuilder.removeFormItem(autoscaleMaxThroughputFormItem);
        formBuilder.removeFormItem(manualThroughputFormItem);
        formBuilder.removeFormItem(separatorFormItem);
        formBuilder.removeFormItem(collectionNameInputFormItem);
        formBuilder.removeFormItem(collectionShardingRadioButtonsFormItem);
        formBuilder.removeFormItem(shardKeyInputFormItem);
      } catch (e) {
        // Ignore errors. We might remove an item that wasn't added
      }

      formBuilder.addFormItem(databaseNameFormItem, {
        titleFontSize: 14,
        info: "A database is analogous to a namespace. It is the unit of management for a set of collections.",
      });

      if (model.isCreateNewDatabase) {
        formBuilder.addFormItem(isSharedThroughputFormItem, {
          titleFontSize: 14,
          info: "Throughput configured at the database level will be shared across all collections within the database.",
        });

        databaseThroughputRadioButtonsFormItem = createRadioButtonsFormItem(
          "databaseThroughput",
          "Autoscale",
          "Manual (400 - unlimited RU/s)",
          model.newDatabaseInfo.isAutoScale,
          (isAutoScale: boolean) => {
            if (!model.newDatabaseInfo || model.newDatabaseInfo.isAutoScale === isAutoScale) {
              return;
            }

            model.newDatabaseInfo.isAutoScale = isAutoScale;
            renderModel();
          },
          "Database Throughput"
        );

        formBuilder.addFormItem(databaseThroughputRadioButtonsFormItem, {
          titleFontSize: 14,
          info: "Set the throughput — Request Units per second (RU/s) — required for the workload. A read of a 1 KB document uses 1 RU. Select manual if you plan to scale RU/s yourself. Select autoscale to allow the system to scale RU/s based on usage.",
        });

        if (model.newDatabaseInfo.isAutoScale) {
          formBuilder.addFormItem(autoscaleMaxThroughputFormItem, {
            titleFontSize: 14,
            componentHeight: 80,
          });
        } else {
          formBuilder.addFormItem(manualThroughputFormItem, {
            titleFontSize: 14,
            componentHeight: 80,
          });
        }
      }

      formBuilder.addFormItem(separatorFormItem, {
        titleFontSize: 14,
        componentHeight: 40,
      });

      formBuilder.addFormItem(collectionNameInputFormItem, {
        titleFontSize: 14,
        info: "Unique identifier for the collection and used for id-based routing through REST and all SDKs.",
      });

      collectionShardingRadioButtonsFormItem = createRadioButtonsFormItem(
        "collectionSharding",
        "Unsharded",
        "Sharded",
        !model.isSharded,
        (isUnsharded: boolean) => {
          if (model.isSharded !== isUnsharded) {
            return;
          }
          model.isSharded = !isUnsharded;
          renderModel();
        },
        "Shard key"
      );

      formBuilder.addFormItem(collectionShardingRadioButtonsFormItem, {
        titleFontSize: 14,
        info: "Sharded collections split your data across many replica sets (shards) to achieve unlimited scalability. Sharded collections require choosing a shard key (field) to evenly distribute your data.",
      });

      if (model.isSharded) {
        formBuilder.addFormItem(shardKeyInputFormItem, {
          titleFontSize: 14,
          info: "The shard key (field) is used to split your data across many replica sets (shards) to achieve unlimited scalability. It’s critical to choose a field that will evenly distribute your data.",
        });
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

    const isSharedThroughputFormItem = {
      component: isSharedThroughput,
      title: "Provision throughput",
    };

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

    let databaseThroughputRadioButtonsFormItem: azdata.FormComponent; // Assigned by render

    const autoscaleMaxThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: model.newDatabaseInfo.databaseMaxThroughputRUPS.toString(),
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
        value: model.newDatabaseInfo.databaseRequiredThroughputRUPS.toString(),
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
      if (model.isCreateNewDatabase === !state) {
        return;
      }

      model.isCreateNewDatabase = !state;
      updateNewDatabaseFormItem(databaseSectionContainer, !state);
      renderModel();
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
        value: collectionName ?? DEFAULT_NEW_COLLECTION_NAME,
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
        checked: !model.isSharded,
      })
      .component();

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

    const separatorFormItem = {
      component: view.modelBuilder.separator().component(),
      title: undefined,
    };

    const collectionNameInputFormItem = {
      component: collectionNameInput,
      title: "Enter Collection name", // localize('createSessionDialog.selectTemplates', "Select session template:")
      required: true,
    };

    let collectionShardingRadioButtonsFormItem: azdata.FormComponent;

    const formBuilder = view.modelBuilder.formContainer();
    renderModel();
    const formModel = formBuilder.withLayout({ width: "100%" }).component();

    // Initialization
    updateNewDatabaseFormItem(databaseSectionContainer, model.isCreateNewDatabase);
    await view.initializeModel(formModel);
  });

  return dialog;
};
