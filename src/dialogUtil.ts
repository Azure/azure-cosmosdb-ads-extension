import * as azdata from "azdata";

export interface NewCollectionFormData {
  isCreateNewDatabase: boolean;
  existingDatabaseId: string;
  newDatabaseInfo: {
    newDatabaseName: string;
    isShareDatabaseThroughput: boolean;
  };
  newCollectionName: string;
  isSharded: boolean;
  shardKey: string | undefined;
  isProvisionCollectionThroughput: boolean;
  isAutoScale: boolean;
  maxThroughputRUPS: number;
  requiredThroughputRUPS: number;
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
const DEFAULT_MAX_THROUGHPUT_RUPS = 4000;
const DEFAULT_REQUIRED_RUPS = 400;
const DEFAULT_NEW_COLLECTION_NAME = "";
const DEFAULT_IS_SHARDED = false;
const DEFAULT_SHARD_KEY = "";
const DEFAULT_IS_PROVISION_COLL_THROUGHPUT = false;

const createRadioButtonsFormItem = (
  view: azdata.ModelView,
  groupName: string,
  option1Label: string,
  option2Label: string,
  isOption1Checked: boolean,
  onOption1ChangeCheckState: (isChecked: boolean) => void,
  title: string,
  additionalComponent?: azdata.Component
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

  return additionalComponent
    ? {
        component: view.modelBuilder.divContainer().withItems([radioButtonsContainer, additionalComponent]).component(),
        title,
        required: true,
      }
    : {
        component: radioButtonsContainer,
        title,
        required: true,
      };
};

const createTextToCalculatorContainer = (view: azdata.ModelView) => {
  return view.modelBuilder
    .flexContainer()
    .withLayout({ flexFlow: "row", justifyContent: "flex-start", alignItems: "center" })
    .withItems(
      [
        view.modelBuilder
          .text()
          .withProps({ value: "Estimate your required RU/s with", CSSStyles: { marginTop: 0, marginBottom: 0 } })
          .component(),
        view.modelBuilder
          .text()
          .withProps({ value: "_", CSSStyles: { marginTop: 0, marginBottom: 0, opacity: 0 } })
          .component(),
        view.modelBuilder
          .hyperlink()
          .withProps({ label: "capacity calculator", url: "https://cosmos.azure.com/capacitycalculator/" })
          .component(),
      ],
      { flex: "0 0 auto" }
    )
    .component();
};

export const createNewDatabaseDialog = async (
  onCreateClick: (data: NewDatabaseFormData) => void,
  databaseName?: string
): Promise<azdata.window.Dialog> => {
  const dialog = azdata.window.createModelViewDialog("New Database");

  const model: NewDatabaseFormData = {
    newDatabaseName: DEFAULT_NEW_DATABASE_NAME,
    isShareDatabaseThroughput: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT,
    isAutoScale: DEFAULT_IS_AUTOSCALE,
    databaseMaxThroughputRUPS: DEFAULT_MAX_THROUGHPUT_RUPS,
    databaseRequiredThroughputRUPS: DEFAULT_REQUIRED_RUPS,
  };

  dialog.okButton.onClick(() => onCreateClick(model));
  dialog.cancelButton.onClick(() => {});
  dialog.okButton.label = "Create";
  dialog.cancelButton.label = "Cancel";

  dialog.registerContent(async (view) => {
    const renderModel = () => {
      // Clear form
      try {
        formBuilder.removeFormItem(newDatabaseNameInputFormItem);
        formBuilder.removeFormItem(isSharedThroughputFormItem);
        formBuilder.removeFormItem(databaseThroughputRadioButtonsFormItem);
        formBuilder.removeFormItem(autoscaleMaxThroughputFormItem);
        formBuilder.removeFormItem(manualThroughputFormItem);
      } catch (e) {
        // Ignore errors. We might remove an item that wasn't added
      }

      formBuilder.addFormItem(newDatabaseNameInputFormItem, {
        titleFontSize: 14,
        info: "A database is analogous to a namespace. It is the unit of management for a set of collections.",
      });

      formBuilder.addFormItem(isSharedThroughputFormItem, {
        titleFontSize: 14,
        info: "Throughput configured at the database level will be shared across all collections within the database.",
      });

      if (model.isShareDatabaseThroughput) {
        databaseThroughputRadioButtonsFormItem = createRadioButtonsFormItem(
          view,
          "databaseThroughput",
          "Autoscale",
          "Manual (400 - unlimited RU/s)",
          model.isAutoScale,
          (isAutoScale: boolean) => {
            if (model.isAutoScale === isAutoScale) {
              return;
            }

            model.isAutoScale = isAutoScale;
            renderModel();
          },
          "Database Throughput",
          createTextToCalculatorContainer(view)
        );

        formBuilder.addFormItem(databaseThroughputRadioButtonsFormItem, {
          titleFontSize: 14,
          info: "Set the throughput — Request Units per second (RU/s) — required for the workload. A read of a 1 KB document uses 1 RU. Select manual if you plan to scale RU/s yourself. Select autoscale to allow the system to scale RU/s based on usage.",
        });

        if (model.isAutoScale) {
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
    newDatabaseNameInput.onTextChanged((text) => (model.newDatabaseName = text));
    const newDatabaseNameInputFormItem: azdata.FormComponent = {
      component: newDatabaseNameInput,
      title: "Database Id",
    };

    const isSharedThroughput = view.modelBuilder
      .checkBox()
      .withProps({ checked: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT, label: "Share throughput across collections" })
      .component();
    isSharedThroughput.onChanged((isSharedThroughput) => {
      if (model.isShareDatabaseThroughput === isSharedThroughput) {
        return;
      }

      model.isShareDatabaseThroughput = isSharedThroughput;
      renderModel();
    });
    const isSharedThroughputFormItem: azdata.FormComponent = {
      component: isSharedThroughput,
      title: "Provision throughput",
    };

    let databaseThroughputRadioButtonsFormItem: azdata.FormComponent;

    const autoscaleMaxThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: DEFAULT_MAX_THROUGHPUT_RUPS.toString(),
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
        value: DEFAULT_REQUIRED_RUPS.toString(),
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
    const formModel = formBuilder.withLayout({ width: "100%" }).component();
    renderModel();
    await view.initializeModel(formModel);
  });

  return dialog;
};

export const createNewCollectionDialog = async (
  onCreateClick: (data: NewCollectionFormData) => void,
  existingDatabaseIds: { id: string; isSharedThroughput: boolean }[],
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
    },
    newCollectionName: collectionName ?? DEFAULT_NEW_COLLECTION_NAME,
    isSharded: DEFAULT_IS_SHARDED,
    shardKey: DEFAULT_SHARD_KEY,
    isProvisionCollectionThroughput: DEFAULT_IS_PROVISION_COLL_THROUGHPUT,
    isAutoScale: DEFAULT_IS_AUTOSCALE,
    maxThroughputRUPS: DEFAULT_MAX_THROUGHPUT_RUPS,
    requiredThroughputRUPS: DEFAULT_REQUIRED_RUPS,
  };

  // If the provided databaseName exists already, we're not creating a new database
  if (databaseName) {
    model.isCreateNewDatabase = existingDatabaseIds.find((d) => d.id === databaseName) === undefined;
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

    const renderModel = () => {
      const addThroughputInputsToForm = () => {
        throughputRadioButtonsFormItem = createRadioButtonsFormItem(
          view,
          "databaseThroughput",
          "Autoscale",
          "Manual (400 - unlimited RU/s)",
          model.isAutoScale,
          (isAutoScale: boolean) => {
            if (!model.newDatabaseInfo || model.isAutoScale === isAutoScale) {
              return;
            }

            model.isAutoScale = isAutoScale;
            renderModel();
          },
          "Database Throughput",
          createTextToCalculatorContainer(view)
        );

        formBuilder.addFormItem(throughputRadioButtonsFormItem, {
          titleFontSize: 14,
          info: "Set the throughput — Request Units per second (RU/s) — required for the workload. A read of a 1 KB document uses 1 RU. Select manual if you plan to scale RU/s yourself. Select autoscale to allow the system to scale RU/s based on usage.",
        });

        if (model.isAutoScale) {
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
      };

      // Clear form
      try {
        formBuilder.removeFormItem(databaseNameFormItem);
        formBuilder.removeFormItem(isSharedThroughputFormItem);
        formBuilder.removeFormItem(throughputRadioButtonsFormItem);
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

        if (model.newDatabaseInfo.isShareDatabaseThroughput) {
          addThroughputInputsToForm();
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
        view,
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

      if (model.isCreateNewDatabase) {
        if (!model.newDatabaseInfo.isShareDatabaseThroughput) {
          addThroughputInputsToForm();
        }
      } else {
        if (model.isProvisionCollectionThroughput) {
          addThroughputInputsToForm();
        }
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
    isSharedThroughput.onChanged((isSharedThroughput) => {
      if (model.newDatabaseInfo.isShareDatabaseThroughput === isSharedThroughput) {
        return;
      }

      model.newDatabaseInfo.isShareDatabaseThroughput = isSharedThroughput;
      model.isProvisionCollectionThroughput = !model.newDatabaseInfo.isShareDatabaseThroughput;
      renderModel();
    });

    const isSharedThroughputFormItem = {
      component: isSharedThroughput,
      title: "Provision throughput",
    };

    const existingDatabaseIdsDropdown = view.modelBuilder
      .dropDown()
      .withProps({
        values: existingDatabaseIds.map((d) => d.id),
      })
      .component();
    existingDatabaseIdsDropdown.onValueChanged((databaseId) => {
      if (model.existingDatabaseId === databaseId.selected) {
        return;
      }

      model.existingDatabaseId = databaseId.selected;
      const dbInfo = existingDatabaseIds.find((d) => d.id === model.existingDatabaseId);
      model.isProvisionCollectionThroughput = dbInfo === undefined || !dbInfo.isSharedThroughput;

      renderModel();
    });
    if (!model.isCreateNewDatabase) {
      existingDatabaseIdsDropdown.value = model.existingDatabaseId;
    }

    let throughputRadioButtonsFormItem: azdata.FormComponent; // Assigned by render

    const autoscaleMaxThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: model.maxThroughputRUPS.toString(),
        placeHolder: "Database Max throughput",
      })
      .component();
    autoscaleMaxThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.maxThroughputRUPS = Number.parseInt(text))
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
        value: model.requiredThroughputRUPS.toString(),
        placeHolder: "Database required throughput",
      })
      .component();
    manualThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.requiredThroughputRUPS = Number.parseInt(text))
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
      .withLayout({ flexFlow: "row", height: 30 })
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
