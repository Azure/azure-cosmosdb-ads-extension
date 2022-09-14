import * as azdata from "azdata";
import * as nls from "vscode-nls";

const localize = nls.loadMessageBundle();

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
const MIN_REQUIRED_RUPS = 400;
const DEFAULT_NEW_COLLECTION_NAME = "";
const DEFAULT_IS_SHARDED = false;
const DEFAULT_SHARD_KEY = "";
const DEFAULT_IS_PROVISION_COLL_THROUGHPUT = false;

const COSMOSDB_NAME_MIN_LENGTH = 3;
const COSMOSDB_DATABASE_NAME_MAX_LENGTH = 44;
const COSMOSDB_COLLECTION_NAME_MAX_LENGTH = 63;

/**
 * From https://azure.github.io/PSRule.Rules.Azure/en/rules/Azure.Cosmos.AccountName/
 * Between 3 and 44 characters long.
 * Lowercase letters, numbers, and hyphens.
 * Start and end with letters and numbers.
 * @param component
 * @returns
 */
const validateCosmosDbDatabaseName = (component: azdata.InputBoxComponent): boolean =>
  validateCosmosDbName(
    component.value,
    (message: string) => {
      // Don't update message if no change as it incurs a new validation call and we end up in a loop
      if ((component.validationErrorMessage ?? "") !== message) {
        // Update the message if needed
        component.validationErrorMessage = message;
      }
    },
    COSMOSDB_NAME_MIN_LENGTH,
    COSMOSDB_DATABASE_NAME_MAX_LENGTH
  );

/**
 * https://github.com/MicrosoftDocs/azure-docs/blob/main/articles/cosmos-db/sql/how-to-dotnet-create-container.md
 * Keep container names between 3 and 63 characters long
 * Container names can only contain lowercase letters, numbers, or the dash (-) character.
 * Container names must start with a lowercase letter or number.
 * @param component
 * @returns
 */
const validateCosmosDbCollectionName = (component: azdata.InputBoxComponent): boolean =>
  validateCosmosDbName(
    component.value,
    (message: string) => {
      // Don't update message if no change as it incurs a new validation call and we end up in a loop
      if ((component.validationErrorMessage ?? "") !== message) {
        // Update the message if needed
        component.validationErrorMessage = message;
      }
    },
    COSMOSDB_NAME_MIN_LENGTH,
    COSMOSDB_COLLECTION_NAME_MAX_LENGTH
  );

export const validateCosmosDbName = (
  value: string | undefined,
  onError: (errorMessage: string) => void,
  minLength: number,
  maxLength: number
): boolean => {
  if (value === undefined || value === "") {
    onError(localize("nameEmptyError", "Cannot be empty"));
    return false;
  }

  if (value.length < minLength) {
    onError(localize("nameMinError", "Minimum character length: {0}", minLength));
    return false;
  }

  if (value.length > maxLength) {
    onError(localize("nameMaxError", "Maximum character length: {0}", maxLength));
    return false;
  }

  if (!value.match(/^[a-z0-9-]*$/g)) {
    onError(localize("nameWrongCharError", "Must contain only lowercase letters, numbers and hyphens"));
    return false;
  }

  if (!value[0].match(/[a-z0-9]/g) || !value[value.length - 1].match(/[a-z0-9]/g)) {
    onError(localize("startEndCharError", "Must start and end with lowercase letter or number"));
    return false;
  }

  onError("");
  return true;
};

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
          .withProps({
            value: localize("estimateYourRequiredRU", "Estimate your required RU/s with"),
            CSSStyles: { marginTop: 0, marginBottom: 0 },
          })
          .component(),
        view.modelBuilder
          .text()
          .withProps({ value: "_", CSSStyles: { marginTop: 0, marginBottom: 0, opacity: 0 } })
          .component(),
        view.modelBuilder
          .hyperlink()
          .withProps({
            label: localize("capacityCalculator", "capacity calculator"),
            url: "https://cosmos.azure.com/capacitycalculator/",
          })
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
  const dialog = azdata.window.createModelViewDialog(localize("newDatabase", "New Database"));

  const model: NewDatabaseFormData = {
    newDatabaseName: DEFAULT_NEW_DATABASE_NAME,
    isShareDatabaseThroughput: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT,
    isAutoScale: DEFAULT_IS_AUTOSCALE,
    databaseMaxThroughputRUPS: DEFAULT_MAX_THROUGHPUT_RUPS,
    databaseRequiredThroughputRUPS: MIN_REQUIRED_RUPS,
  };

  dialog.okButton.onClick(() => onCreateClick(model));
  dialog.cancelButton.onClick(() => {});
  dialog.okButton.label = localize("create", "Create");
  dialog.cancelButton.label = localize("cancel", "Cancel");

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
        info: localize(
          "databaseHelperInfo",
          "A database is analogous to a namespace. It is the unit of management for a set of collections."
        ),
      });

      formBuilder.addFormItem(isSharedThroughputFormItem, {
        titleFontSize: 14,
        info: localize(
          "throughputHelperInfo",
          "Throughput configured at the database level will be shared across all collections within the database."
        ),
      });

      if (model.isShareDatabaseThroughput) {
        databaseThroughputRadioButtonsFormItem = createRadioButtonsFormItem(
          view,
          "databaseThroughput",
          localize("autoscale", "Autoscale"),
          localize("manual400toUnlimited", "Manual (400 - unlimited RU/s)"),
          model.isAutoScale,
          (isAutoScale: boolean) => {
            if (model.isAutoScale === isAutoScale) {
              return;
            }

            model.isAutoScale = isAutoScale;
            renderModel();
          },
          localize("databaseThroughput", "Database Throughput"),
          createTextToCalculatorContainer(view)
        );

        formBuilder.addFormItem(databaseThroughputRadioButtonsFormItem, {
          titleFontSize: 14,
          info: localize(
            "througphputRequestHelperInfo",
            "Set the throughput — Request Units per second (RU/s) — required for the workload. A read of a 1 KB document uses 1 RU. Select manual if you plan to scale RU/s yourself. Select autoscale to allow the system to scale RU/s based on usage."
          ),
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
        placeHolder: localize("enterNewDatabaseName", "Enter new database name"),
      })
      .withValidation((component) => validateCosmosDbDatabaseName(component))
      .component();
    newDatabaseNameInput.onTextChanged((text) => (model.newDatabaseName = text));
    const newDatabaseNameInputFormItem: azdata.FormComponent = {
      component: newDatabaseNameInput,
      title: localize("databaseId", "Database Id"),
    };

    const isSharedThroughput = view.modelBuilder
      .checkBox()
      .withProps({
        checked: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT,
        label: localize("shareThroughputAcrossCollections", "Share throughput across collections"),
      })
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
      title: localize("provisionThroughput", "Provision throughput"),
    };

    let databaseThroughputRadioButtonsFormItem: azdata.FormComponent;

    const autoscaleMaxThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: DEFAULT_MAX_THROUGHPUT_RUPS.toString(),
        inputType: "number",
        placeHolder: localize("databaseMaxThroughput", "Database Max throughput"),
      })
      .component();
    autoscaleMaxThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.databaseMaxThroughputRUPS = Number.parseInt(text))
    );

    const autoscaleMaxThroughputFormItem: azdata.FormComponent = {
      component: autoscaleMaxThroughputInput,
      title: localize("databaseMaxRu", "Database Max RU/s"),
      required: true,
    };

    const manualThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        value: MIN_REQUIRED_RUPS.toString(),
        min: MIN_REQUIRED_RUPS,
        inputType: "number",
        placeHolder: localize("databaseRequiredThroughput", "Database required throughput"),
      })
      .component();
    manualThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.databaseRequiredThroughputRUPS = Number.parseInt(text))
    );

    const manualThroughputFormItem: azdata.FormComponent = {
      component: manualThroughputInput,
      title: localize("databaseRequiredRu", "Database Required RU/s"),
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
  const dialog = azdata.window.createModelViewDialog(localize("newCollection", "New Collection"));

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
    requiredThroughputRUPS: MIN_REQUIRED_RUPS,
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
  dialog.okButton.label = localize("create", "Create");
  dialog.cancelButton.label = localize("cancel", "Cancel");

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
          localize("autoscale", "Autoscale"),
          localize("manual400toUnlimited", "Manual (400 - unlimited RU/s)"),
          model.isAutoScale,
          (isAutoScale: boolean) => {
            if (!model.newDatabaseInfo || model.isAutoScale === isAutoScale) {
              return;
            }

            model.isAutoScale = isAutoScale;
            renderModel();
          },
          localize("databaseThroughput", "Database Throughput"),
          createTextToCalculatorContainer(view)
        );

        formBuilder.addFormItem(throughputRadioButtonsFormItem, {
          titleFontSize: 14,
          info: localize(
            "througphputRequestHelperInfo",
            "Set the throughput — Request Units per second (RU/s) — required for the workload. A read of a 1 KB document uses 1 RU. Select manual if you plan to scale RU/s yourself. Select autoscale to allow the system to scale RU/s based on usage."
          ),
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
        info: localize(
          "databaseHelperInfo",
          "A database is analogous to a namespace. It is the unit of management for a set of collections."
        ),
      });

      if (model.isCreateNewDatabase) {
        formBuilder.addFormItem(isSharedThroughputFormItem, {
          titleFontSize: 14,
          info: localize(
            "throughputHelperInfo",
            "Throughput configured at the database level will be shared across all collections within the database."
          ),
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
        info: localize(
          "collectionHelperInfo",
          "Unique identifier for the collection and used for id-based routing through REST and all SDKs."
        ),
      });

      collectionShardingRadioButtonsFormItem = createRadioButtonsFormItem(
        view,
        "collectionSharding",
        localize("unsharded", "Unsharded"),
        localize("sharded", "Sharded"),
        !model.isSharded,
        (isUnsharded: boolean) => {
          if (model.isSharded !== isUnsharded) {
            return;
          }
          model.isSharded = !isUnsharded;
          renderModel();
        },
        localize("shardKey", "Shard key")
      );

      formBuilder.addFormItem(collectionShardingRadioButtonsFormItem, {
        titleFontSize: 14,
        info: localize(
          "shardKeyTitleInfoHelper",
          "Sharded collections split your data across many replica sets (shards) to achieve unlimited scalability. Sharded collections require choosing a shard key (field) to evenly distribute your data."
        ),
      });

      if (model.isSharded) {
        formBuilder.addFormItem(shardKeyInputFormItem, {
          titleFontSize: 14,
          info: localize(
            "shardKeyInputInfoHelper",
            "The shard key (field) is used to split your data across many replica sets (shards) to achieve unlimited scalability. It’s critical to choose a field that will evenly distribute your data."
          ),
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
        placeHolder: localize("enterNewDatabaseName", "Enter new database name"),
      })
      .withValidation((component) => validateCosmosDbDatabaseName(component))
      .component();
    newDatabaseNameInput.onTextChanged((text) => (model.newDatabaseInfo.newDatabaseName = text));

    const isSharedThroughput = view.modelBuilder
      .checkBox()
      .withProps({
        checked: DEFAULT_IS_SHARED_DATABASE_THROUGHPUT,
        label: localize("shareThroughputAcrossCollections", "Share throughput across collections"),
      })
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
      title: localize("provisionThroughput", "Provision throughput"),
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
        inputType: "number",
        value: model.maxThroughputRUPS.toString(),
        placeHolder: localize("databaseMaxThroughput", "Database Max throughput"),
      })
      .component();
    autoscaleMaxThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.maxThroughputRUPS = Number.parseInt(text))
    );

    const autoscaleMaxThroughputFormItem: azdata.FormComponent = {
      component: autoscaleMaxThroughputInput,
      title: localize("databaseMaxRu", "Database Max RU/s"),
      required: true,
    };

    const manualThroughputInput = view.modelBuilder
      .inputBox()
      .withProps({
        required: true,
        multiline: false,
        inputType: "number",
        min: MIN_REQUIRED_RUPS,
        value: model.requiredThroughputRUPS.toString(),
        placeHolder: localize("databaseRequiredThroughput", "Database required throughput"),
      })
      .component();
    manualThroughputInput.onTextChanged(
      (text) => !isNaN(text) && (model.requiredThroughputRUPS = Number.parseInt(text))
    );

    const manualThroughputFormItem: azdata.FormComponent = {
      component: manualThroughputInput,
      title: localize("databaseRequiredRu", "Database Required RU/s"),
      required: true,
    };

    // Selection between create new or use existing database
    const createNewRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "createNewOrExisting",
        label: localize("createNew", "Create New"),
        value: "new",
        checked: model.isCreateNewDatabase,
      })
      .component();

    const useExistingRadioButton = view.modelBuilder
      .radioButton()
      .withProps({
        name: "createNewOrExisting",
        label: localize("useExisting", "Use existing"),
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
        placeHolder: localize("enterNewCollectionName", "Enter new collection name"),
      })
      .withValidation((component) => validateCosmosDbCollectionName(component))
      .component();
    collectionNameInput.onTextChanged((text) => (model.newCollectionName = text));

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
      title: localize("shardKey", "Shard key"),
    };

    const databaseNameFormItem: azdata.FormComponent = {
      component: view.modelBuilder
        .divContainer()
        .withItems([createDatabaseRadioButtonsModel, databaseSectionContainer])
        .component(),
      title: localize("databaseName", "Database Name"),
      required: true,
    };

    const separatorFormItem = {
      component: view.modelBuilder.separator().component(),
      title: undefined,
    };

    const collectionNameInputFormItem = {
      component: collectionNameInput,
      title: localize("enterCollectionName", "Enter Collection name"),
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
