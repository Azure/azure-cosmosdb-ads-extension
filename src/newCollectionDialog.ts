import * as azdata from "azdata";
import * as vscode from "vscode";

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

  // Existing databases
  const databases = view.modelBuilder
    .dropDown()
    .withProps({
      values: ["database1", "database2"],
    })
    .component();

  const isSharedThroughput = view.modelBuilder
    .checkBox()
    .withProps({ enabled: true, label: "Share throughput across collections" })
    .component();

  existingContainer.clearItems();
  if (isCreateNew) {
    existingContainer.addItem(newDatabaseNameInput);
  } else {
    existingContainer.addItem(databases);
  }

  existingContainer.addItem(isSharedThroughput);
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
          padding: "10px",
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
        ],
        title: "",
      },
    ]);

    const formModel = formBuilder.withLayout({ width: "100%" }).component();

    // Initialization
    updateNewDatabaseSection(view, databaseSectionContainer, true);
    await view.initializeModel(formModel);
  });

  return dialog;
};
