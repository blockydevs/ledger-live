import { useDispatch, useSelector } from "react-redux";
import { setLedgerSyncActivateDrawer } from "~/actions/walletSync";
import { useCurrentStep } from "../../WalletSync/hooks/useCurrentStep";
import { useCallback } from "react";
import { activateDrawerSelector } from "~/reducers/walletSync";
import { Steps } from "../../WalletSync/types/Activation";

export function useActivationDrawer() {
  const dispatch = useDispatch();
  const { setCurrentStep } = useCurrentStep();
  const isActivationDrawerVisible = useSelector(activateDrawerSelector);

  const openActivationDrawer = useCallback(() => {
    dispatch(setLedgerSyncActivateDrawer(true));
  }, [dispatch]);

  const closeActivationDrawer = useCallback(() => {
    dispatch(setLedgerSyncActivateDrawer(false));
    setCurrentStep(Steps.Activation);
  }, [dispatch, setCurrentStep]);

  return {
    isActivationDrawerVisible,
    openActivationDrawer,
    closeActivationDrawer,
  };
}
