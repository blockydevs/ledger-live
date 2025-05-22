import { SyncOneAccountOnMount } from "@ledgerhq/live-common/bridge/react/index";
import React from "react";
import { Trans } from "react-i18next";
import styled from "styled-components";
import Box from "~/renderer/components/Box";
import BroadcastErrorDisclaimer from "~/renderer/components/BroadcastErrorDisclaimer";
import Button from "~/renderer/components/Button";
import ErrorDisplay from "~/renderer/components/ErrorDisplay";
import RetryButton from "~/renderer/components/RetryButton";
import SuccessDisplay from "~/renderer/components/SuccessDisplay";
import { StepProps } from "../Body";
import TrackPage from "~/renderer/analytics/TrackPage";
import { setDrawer } from "~/renderer/drawers/Provider";
import { OperationDetails } from "~/renderer/drawers/OperationDetails";

const Container = styled(Box).attrs<{
  shouldSpace?: boolean;
}>(() => ({
  alignItems: "center",
  grow: true,
  color: "palette.text.shade100",
}))<{
  shouldSpace?: boolean;
}>`
  justify-content: ${p => (p.shouldSpace ? "space-between" : "center")};
`;

// FIXME:
// - i18n
function StepAssociateConfirmation({
  t,
  transaction,
  optimisticOperation,
  error,
  signed,
}: StepProps) {
  if (optimisticOperation) {
    const tokenName = transaction?.properties ? transaction.properties.token.name : "token";

    return (
      <Container>
        <TrackPage
          category="Hedera Token Association Flow"
          name="Step Confirmed"
          flow="associate"
        />
        <SyncOneAccountOnMount priority={10} accountId={optimisticOperation.accountId} />
        <SuccessDisplay
          title="Transaction sent"
          description={`You'll be able to receive ${tokenName} once the network confirms the token association.`}
        />
      </Container>
    );
  }

  if (error) {
    return (
      <Container shouldSpace={signed}>
        <TrackPage
          category="Hedera Token Association Flow"
          name="Step Confirmation Error"
          flow="associate"
        />
        {signed ? <BroadcastErrorDisclaimer title="boradcast error title" /> : null}
        <ErrorDisplay error={error} withExportLogs />
      </Container>
    );
  }

  return null;
}

export function StepAssociateConfirmationFooter({
  account,
  parentAccount,
  optimisticOperation,
  error,
  onRetry,
  closeModal,
  onClose,
}: StepProps) {
  const concernedOperation = optimisticOperation
    ? optimisticOperation.subOperations && optimisticOperation.subOperations.length > 0
      ? optimisticOperation.subOperations[0]
      : optimisticOperation
    : null;

  return (
    <Box horizontal alignItems="right">
      <Button data-testid="modal-close-button" ml={2} onClick={onClose}>
        <Trans i18nKey="common.close" />
      </Button>
      {concernedOperation ? (
        <Button
          ml={2}
          id={"hedera-token-association-confirmation-opc-button"}
          event="Hedera Token Association Flow View OpD Clicked"
          onClick={() => {
            closeModal();
            if (account && concernedOperation) {
              setDrawer(OperationDetails, {
                operationId: concernedOperation.id,
                accountId: account.id,
                parentId: (parentAccount && parentAccount.id) || undefined,
              });
            }
          }}
          primary
        >
          {/* FIXME: i18n */}
          View details
        </Button>
      ) : error ? (
        <RetryButton primary ml={2} onClick={onRetry} />
      ) : null}
    </Box>
  );
}

export default StepAssociateConfirmation;
