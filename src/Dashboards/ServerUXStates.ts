// Mapping provisioning state to the same values displayed in portal (see DatabaseStatusUtility.getUxState())

class DocumentServiceResourceStatus {
  public static Initializing = "Initializing";
  public static Creating = "Creating";
  public static Verifying = "Verifying";
  public static Online = "Online";
  public static Offline = "Offline";
  public static Offlining = "Offlining";
  public static Deleting = "Deleting";
  public static DeletionFailed = "DeletionFailed";
  public static Updating = "Updating";
  public static NotFound = "NotFound";
  public static CreationFailed = "CreationFailed";
  public static Restoring = "Restoring";
  public static RestoreFailed = "RestoreFailed";
}

class ResourceProvisiningTerminalStates {
  public static Succeeded = "Succeeded";
  public static Failed = "Failed";
}

// TODO Translate this
class GeneralResources {
  public static dbSeverStatusOnline = "Online";
  public static accountCreationFailed = "Account Creation Failed";
  public static restoreFailed = "Restore Failed";
  public static failed = "Failed";
  public static dbServerStatusOffline = "Offline";
  public static dbServerStatusCreating = "Creating";
  public static dbServerStatusDeleting = "Deleting";
  public static dbServerStatusUpdating = "Updating";
  public static dbServerStatusRestoring = "Restoring";
  public static dbServerStatusDeletionFailed = "Deletion Failed";
}

export const getServerState = (provisioningState: string | undefined): string => {
  if (!provisioningState) {
    return "Unknown"; // TODO Translate
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
