import React, { useMemo } from "react";

import { StepProps } from "../Body";
import { useBroadcast } from "@ledgerhq/live-common/hooks/useBroadcast";
import DeviceAction from "~/renderer/components/DeviceAction";
import { mockedEventEmitter } from "~/renderer/components/debug/DebugMock";
import connectApp from "@ledgerhq/live-common/hw/connectApp";
import { createAction } from "@ledgerhq/live-common/hw/actions/transaction";
import { getEnv } from "@ledgerhq/live-env";
import { HOOKS_TRACKING_LOCATIONS } from "~/renderer/analytics/hooks/variables";
import { SignedOperation } from "@ledgerhq/types-live";
import StepProgress from "~/renderer/components/StepProgress";
import { DeviceBlocker } from "~/renderer/components/DeviceAction/DeviceBlocker";
import { Trans } from "react-i18next";
import { useSelector } from "react-redux";
import { mevProtectionSelector } from "~/renderer/reducers/settings";

const action = createAction(getEnv("MOCK") ? mockedEventEmitter : connectApp);

// FIXME: translation, ui
const Result = (
  props:
    | {
        signedOperation: SignedOperation | undefined | null;
        device: Device;
      }
    | {
        transactionSignError: Error;
      },
) => {
  if (!("signedOperation" in props)) return null;
  return (
    <StepProgress>
      <DeviceBlocker />
      <Trans i18nKey="send.steps.confirmation.pending.title" />
    </StepProgress>
  );
};

export default function StepAssociateDevice(props: StepProps) {
  const {
    account,
    transaction,
    status,
    parentAccount,
    transitionTo,
    setSigned,
    onOperationBroadcasted,
    onTransactionError,
  } = props;
  const mevProtected = useSelector(mevProtectionSelector);
  const broadcastConfig = useMemo(() => ({ mevProtected }), [mevProtected]);
  const broadcast = useBroadcast({ account, parentAccount, broadcastConfig });

  const request = useMemo(
    () => ({
      parentAccount,
      account,
      transaction,
      status,
    }),
    [parentAccount, account, transaction, status],
  );

  return (
    <DeviceAction
      action={action}
      // @ts-expect-error This type is not compatible with the one expected by the action
      request={request}
      Result={Result}
      onResult={result => {
        if ("signedOperation" in result) {
          const { signedOperation } = result;
          setSigned(true);
          broadcast(signedOperation).then(
            operation => {
              onOperationBroadcasted(operation);
              transitionTo("associateConfirmation");
            },
            error => {
              onTransactionError(error);
              transitionTo("associateConfirmation");
            },
          );
        } else if ("transactionSignError" in result) {
          const { transactionSignError } = result;
          onTransactionError(transactionSignError);
          transitionTo("associateConfirmation");
        }
      }}
      analyticsPropertyFlow="receive"
      location={HOOKS_TRACKING_LOCATIONS.receiveModal}
    />
  );
}
