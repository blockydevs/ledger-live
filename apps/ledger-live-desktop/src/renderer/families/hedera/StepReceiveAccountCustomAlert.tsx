import React from "react";
import { Trans } from "react-i18next";
import { useDispatch } from "react-redux";
import styled from "styled-components";
import { AccountLike } from "@ledgerhq/types-live";
import { isTokenAssociationRequired } from "@ledgerhq/live-common/families/hedera/logic";
import { isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";
import { Link } from "@ledgerhq/react-ui";
import { urls } from "~/config/urls";
import { openModal } from "~/renderer/actions/modals";
import Alert from "~/renderer/components/Alert";
import Box from "~/renderer/components/Box";
import Text from "~/renderer/components/Text";
import { StepProps as ReceiveStepProps } from "~/renderer/modals/Receive/Body";
import { StepProps as ReceiveWithAssociationStepProps } from "./ReceiveWithAssociationModal/Body";
import TranslatedError from "~/renderer/components/TranslatedError";
import { openURL } from "~/renderer/linking";
import { track } from "~/renderer/analytics/segment";

type Props = (ReceiveStepProps | ReceiveWithAssociationStepProps) & {
  account: AccountLike;
};

const Container = styled.div`
  margin-top: 16px;
`;

const ErrorBox = styled(Box)`
  margin-bottom: 16px;
  color: ${p => p.theme.colors.pearl};
`;

const openLearnMore = () => {
  openURL(urls.hedera.tokenAssociation);
  track("Hedera Token Association Flow - learn more");
};

const AssociationPrerequisiteAlert = ({ account, closeModal }: Props) => {
  const dispatch = useDispatch();

  const triggerAssociate = () => {
    closeModal();
    dispatch(
      openModal("MODAL_HEDERA_RECEIVE_WITH_ASSOCIATION", { account, receiveTokenMode: true }),
    );
  };

  return (
    <Container>
      <Alert type="primary">
        <Trans i18nKey="hedera.receive.warnings.associationPrerequisite.text">
          <Link onClick={triggerAssociate} color="inherit" textProps={{ fontWeight: "medium" }} />
          <Link onClick={openLearnMore} color="inherit" textProps={{ fontWeight: "medium" }} />
        </Trans>
      </Alert>
    </Container>
  );
};

const AssociationInsufficientFundsError = (props: Props) => {
  const isReceiveWithAssociationModal = "transaction" in props;

  if (!isReceiveWithAssociationModal) {
    return null;
  }

  const { insufficientAssociateBalance } = props.status.errors;

  if (!insufficientAssociateBalance) {
    return null;
  }

  return (
    <ErrorBox>
      <Text fontSize={12} fontWeight="medium">
        <TranslatedError error={insufficientAssociateBalance} field="description" noLink />
      </Text>
    </ErrorBox>
  );
};

const AssociationRequiredAlert = () => {
  return (
    <Alert type="warning">
      <Trans i18nKey="hedera.receive.warnings.associationRequired.text">
        <Link onClick={openLearnMore} color="inherit" textProps={{ fontWeight: "medium" }} />
      </Trans>
    </Alert>
  );
};

const StepReceiveAccountCustomAlert = (props: Props) => {
  const { account, token, receiveTokenMode } = props;
  const isAssociationFlow = receiveTokenMode ? isTokenAssociationRequired(account, token) : false;

  if (!receiveTokenMode && !isTokenAccount(account)) {
    return <AssociationPrerequisiteAlert {...props} />;
  }

  if (token && isAssociationFlow) {
    return (
      <Container>
        <AssociationInsufficientFundsError {...props} />
        <AssociationRequiredAlert />
      </Container>
    );
  }

  return null;
};

export default StepReceiveAccountCustomAlert;
