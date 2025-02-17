import { EntryPoint } from "./types";
import { useEntryPoint } from "./hooks/useEntryPoint";
import { useActivationDrawer } from "./hooks/useActivationDrawer";

export default function useLedgerSyncEntryPointViewModel({
  entryPoint,
  page,
}: {
  entryPoint: EntryPoint;
  page: string;
}) {
  const { shouldDisplayEntryPoint, entryPointData } = useEntryPoint(entryPoint);
  const { isActivationDrawerVisible, openActivationDrawer, closeActivationDrawer } =
    useActivationDrawer();
  console.log("Use Ledger Sync Entry Point View Model");

  return {
    page,
    shouldDisplayEntryPoint,
    onClickEntryPoint: entryPointData.onClick,
    entryPointComponent: entryPointData.component,
    isActivationDrawerVisible,
    openActivationDrawer,
    closeActivationDrawer,
  };
}
