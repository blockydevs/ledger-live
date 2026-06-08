import React from "react";
import { BackupHubView } from "./BackupHubView";
import { useBackupHubViewModel, type BackupHubParams } from "./useBackupHubViewModel";

function BackupHub(params: BackupHubParams) {
  const props = useBackupHubViewModel(params);

  return <BackupHubView {...props} />;
}

export default BackupHub;
