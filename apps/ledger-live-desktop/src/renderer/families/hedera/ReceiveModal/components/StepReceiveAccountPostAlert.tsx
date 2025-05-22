import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { openModal } from "~/renderer/actions/modals";
import Alert from "~/renderer/components/Alert";
import styled from "styled-components";
import Box from "~/renderer/components/Box";
import Text from "~/renderer/components/Text";
import { useBalanceHistoryWithCountervalue } from "~/renderer/actions/portfolio";
import { useTimeRange } from "~/renderer/actions/settings";
import { counterValueCurrencySelector } from "~/renderer/reducers/settings";
import { StepProps } from "~/renderer/families/hedera/ReceiveModal/Body";
import { AccountLike } from "@ledgerhq/types-live";

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

interface Props extends StepProps {
  account: AccountLike;
}

// FIXME:
// - css
// - translations
// - learnMoreUrl
// - review logic for calculating balance in usd
const StepReceiveAccountPostAlert = ({
  account,
  token,
  receiveTokenMode,
  isAssociateFlow,
  closeModal,
}: Props) => {
  const dispatch = useDispatch();
  const [range] = useTimeRange();
  const counterValue = useSelector(counterValueCurrencySelector);
  const accountBalance = useBalanceHistoryWithCountervalue({ account, range });

  const isTokenAccount = account?.type === "TokenAccount";
  const balance = accountBalance.history[accountBalance.history.length - 1].countervalue;
  const unit = counterValue.units[0];
  const currentHbarWorth = typeof balance === "number" ? balance / 10 ** unit.magnitude : null;
  const hasEnoughBalanceForAssociation = !!currentHbarWorth && currentHbarWorth > 0.05;

  if (!receiveTokenMode && !isTokenAccount) {
    const triggerAssociate = () => {
      closeModal();
      dispatch(openModal("MODAL_HEDERA_RECEIVE", { account, receiveTokenMode: true }));
    };

    return (
      <Container>
        <Alert type="warning" learnMoreLabel="Learn more" learnMoreUrl="https://google.com">
          To receive HTS token your account might need to be associated.{" "}
          <InlineTextButton onClick={triggerAssociate}>Click here</InlineTextButton> to start the
          token association flow.
        </Alert>
      </Container>
    );
  }

  if (token && isAssociateFlow) {
    return (
      <Container>
        {!hasEnoughBalanceForAssociation && (
          <ErrorBox>
            <Text fontSize={12} fontWeight="medium">
              Not enough HBAR to pay for the token association. At least $0.05 worth of HBAR are
              required
            </Text>
          </ErrorBox>
        )}
        <Alert type="warning" learnMoreLabel="Learn more" learnMoreUrl="https://google.com">
          Hedera tokens must be associated with an account before they can be transferred to that
          account. Click continue to associate the account.
        </Alert>
      </Container>
    );
  }

  return null;
};
export default StepReceiveAccountPostAlert;
