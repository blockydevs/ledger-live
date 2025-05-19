import React from "react";
import { useDispatch } from "react-redux";
import { closeModal, openModal } from "~/renderer/actions/modals";
import Alert from "~/renderer/components/Alert";
import { StepProps } from "~/renderer/modals/Receive/Body";
import styled from "styled-components";
import Box from "~/renderer/components/Box";
import Text from "~/renderer/components/Text";

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

// FIXME:
// - css
// - translations
// - learnMoreUrl
const StepReceiveAccountPostAlert = ({
  account,
  token,
  parentAccount,
  receiveTokenMode,
  closeModal,
  ...rest
}: StepProps) => {
  const dispatch = useDispatch();
  const isTokenAccount = account?.type === "TokenAccount";
  const subAccounts = !!account && "subAccounts" in account ? account.subAccounts ?? [] : [];
  const isTokenAssociated = subAccounts.some(item => !!token && item.token.id === token.id);
  const hasEnoughBalanceForAssociation = false;
  console.log("[DEBUG]", { account, receiveTokenMode, parentAccount, rest });

  if (!receiveTokenMode && !isTokenAccount) {
    const triggerAssociate = () => {
      closeModal();
      dispatch(openModal("MODAL_RECEIVE", { account, receiveTokenMode: true }));
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

  if (token && !isTokenAssociated) {
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
