import React from "react";
import { Trans } from "react-i18next";
import { getReceiveFlowError } from "@ledgerhq/live-common/account/index";
import type { Transaction } from "@ledgerhq/live-common/families/hedera/types";

import Button from "~/renderer/components/Button";
import type { StepId, StepProps } from "../Body";

export function StepAccountFooter({
  transitionTo,
  onUpdateTransaction,
  isAssociationFlow,
  receiveTokenMode,
  token,
  account,
  parentAccount,
}: StepProps) {
  const error = account ? getReceiveFlowError(account, parentAccount) : null;
  const isMissingToken = receiveTokenMode && !token;

  const redirectToDeviceStep = () => {
    const deviceStepId: StepId = isAssociationFlow ? "associationDevice" : "device";
    const updatedTransactionProperties = !!token
      ? ({
          name: "tokenAssociate",
          token,
        } satisfies Transaction["properties"])
      : undefined;

    onUpdateTransaction(prev => {
      return {
        ...prev,
        properties: updatedTransactionProperties,
      };
    });

    transitionTo(deviceStepId);
  };

  return (
    <Button
      primary
      data-testid="modal-continue-button"
      disabled={!account || isMissingToken || !!error}
      onClick={redirectToDeviceStep}
    >
      <Trans i18nKey="common.continue" />
    </Button>
  );
}
