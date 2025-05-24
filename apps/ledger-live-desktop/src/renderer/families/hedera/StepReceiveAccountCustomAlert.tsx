import React from "react";
import { Trans } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { AccountLike } from "@ledgerhq/types-live";
import { isTokenAssociationRequired } from "@ledgerhq/live-common/families/hedera/logic";
import { urls } from "~/config/urls";
import { openModal } from "~/renderer/actions/modals";
import Alert from "~/renderer/components/Alert";
import Box from "~/renderer/components/Box";
import Text from "~/renderer/components/Text";
import { useBalanceHistoryWithCountervalue } from "~/renderer/actions/portfolio";
import { useTimeRange } from "~/renderer/actions/settings";
import { counterValueCurrencySelector } from "~/renderer/reducers/settings";
import { StepProps } from "~/renderer/modals/Receive/Body";
import { getEnv } from "@ledgerhq/live-env";

interface Props extends StepProps {
  account: AccountLike;
}

const Container = styled.div`
  margin-top: 16px;
`;

const ErrorBox = styled(Box)`
  margin-bottom: 16px;
  color: ${p => p.theme.colors.pearl};
`;

const InlineTextButton = styled(Box).attrs(() => ({
  cursor: "pointer",
  horizontal: true,
}))`
  align-items: center;
  display: inline-flex;
  text-decoration: underline;
  &:hover {
    opacity: 0.8;
  }

  &:active {
    opacity: 1;
  }
`;

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
      <Alert
        type="warning"
        learnMoreUrl={urls.hedera.tokenAssociation}
        learnMoreLabel={
          <Trans i18nKey="hedera.receive.warnings.associationPrerequisite.learnMore" />
        }
      >
        <Trans i18nKey="hedera.receive.warnings.associationPrerequisite.text">
          <InlineTextButton onClick={triggerAssociate} />
        </Trans>
      </Alert>
    </Container>
  );
};

const AssociationInsufficientFundsError = () => {
  return (
    <ErrorBox>
      <Text fontSize={12} fontWeight="medium">
        <Trans i18nKey="hedera.receive.errors.associationInsufficientFunds.text" />
      </Text>
    </ErrorBox>
  );
};

const AssociationRequiredAlert = () => {
  return (
    <Alert
      type="warning"
      learnMoreUrl={urls.hedera.tokenAssociation}
      learnMoreLabel={<Trans i18nKey="hedera.receive.warnings.associationRequired.learnMore" />}
    >
      <Trans i18nKey="hedera.receive.warnings.associationRequired.text" />
    </Alert>
  );
};

const StepReceiveAccountCustomAlert = (props: Props) => {
  const { account, token, receiveTokenMode } = props;
  const [range] = useTimeRange();
  const counterValue = useSelector(counterValueCurrencySelector);
  const accountBalance = useBalanceHistoryWithCountervalue({ account, range });

  const isTokenAccount = account?.type === "TokenAccount";

  if (!receiveTokenMode && !isTokenAccount) {
    return <AssociationPrerequisiteAlert {...props} />;
  }

  const isAssociationFlow = isTokenAssociationRequired(account, token, receiveTokenMode);
  const balance = accountBalance.history[accountBalance.history.length - 1].countervalue;
  const unit = counterValue.units[0];
  const currentWorthInUSD = typeof balance === "number" ? balance / 10 ** unit.magnitude : null;
  const requiredWorthInUSD = getEnv("HEDERA_TOKEN_ASSOCIATION_MIN_USD");
  const hasEnoughBalanceForAssociation =
    !!currentWorthInUSD && currentWorthInUSD > requiredWorthInUSD;

  if (token && isAssociationFlow) {
    return (
      <Container>
        {!hasEnoughBalanceForAssociation && <AssociationInsufficientFundsError />}
        <AssociationRequiredAlert />
      </Container>
    );
  }

  return null;
};

export default StepReceiveAccountCustomAlert;
