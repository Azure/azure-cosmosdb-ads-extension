// Mapping provisioning state to the same values displayed in portal (see DatabaseStatusUtility.getUxState())
import * as nls from "vscode-nls";
const localize = nls.loadMessageBundle();

class DocumentServiceResourceStatus {
  public static Initializing = localize("initializing", "Initializing");
  public static Creating = localize("creating", "Creating");
  public static Verifying = localize("verifying", "Verifying");
  public static Online = localize("online", "Online");
  public static Offline = localize("offline", "Offline");
  public static Offlining = localize("offlining", "Offlining");
  public static Deleting = localize("deleting", "Deleting");
  public static DeletionFailed = localize("deletionFailed", "DeletionFailed");
  public static Updating = localize("updating", "Updating");
  public static NotFound = localize("notFound", "NotFound");
  public static CreationFailed = localize("creationFailed", "CreationFailed");
  public static Restoring = localize("restoring", "Restoring");
  public static RestoreFailed = localize("restoreFailed", "RestoreFailed");
}

class ResourceProvisiningTerminalStates {
  public static Succeeded = localize("succeeded", "Succeeded");
  public static Failed = localize("failed", "Failed");
}

class GeneralResources {
  public static dbSeverStatusOnline = localize("online", "Online");
  public static accountCreationFailed = localize("accountCreationFailed", "Account Creation Failed");
  public static restoreFailed = localize("restoredFailed", "Restore Failed");
  public static failed = localize("failed", "Failed");
  public static dbServerStatusOffline = localize("offline", "Offline");
  public static dbServerStatusCreating = localize("creating", "Creating");
  public static dbServerStatusDeleting = localize("deleting", "Deleting");
  public static dbServerStatusUpdating = localize("updating", "Updating");
  public static dbServerStatusRestoring = localize("restoring", "Restoring");
  public static dbServerStatusDeletionFailed = localize("deletionFailed", "Deletion Failed");
}

export const getServerState = (provisioningState: string | undefined): string => {
  if (!provisioningState) {
    return localize("unknown", "Unknown");
  }
  switch (provisioningState.toUpperCase()) {
    case DocumentServiceResourceStatus.Online.toUpperCase():
    case ResourceProvisiningTerminalStates.Succeeded.toUpperCase():
      return GeneralResources.dbSeverStatusOnline;

    case DocumentServiceResourceStatus.CreationFailed.toUpperCase():
      return GeneralResources.accountCreationFailed;

    case DocumentServiceResourceStatus.RestoreFailed.toUpperCase():
      return GeneralResources.restoreFailed;

    case ResourceProvisiningTerminalStates.Failed.toUpperCase():
      return GeneralResources.failed;

    case DocumentServiceResourceStatus.NotFound.toUpperCase():
      return GeneralResources.dbServerStatusOffline;

    case DocumentServiceResourceStatus.Creating.toUpperCase():
    case DocumentServiceResourceStatus.Initializing.toUpperCase():
    case DocumentServiceResourceStatus.Verifying.toUpperCase():
      return GeneralResources.dbServerStatusCreating;

    case DocumentServiceResourceStatus.Deleting.toUpperCase():
      return GeneralResources.dbServerStatusDeleting;

    case DocumentServiceResourceStatus.Updating.toUpperCase():
      return GeneralResources.dbServerStatusUpdating;

    case DocumentServiceResourceStatus.Restoring.toUpperCase():
      return GeneralResources.dbServerStatusRestoring;

    case DocumentServiceResourceStatus.DeletionFailed.toUpperCase():
      return GeneralResources.dbServerStatusDeletionFailed;

    default:
      // TODO Add Telemetry
      return provisioningState;
  }
};
