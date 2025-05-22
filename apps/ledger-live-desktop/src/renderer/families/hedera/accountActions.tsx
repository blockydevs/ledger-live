import { Account, TokenAccount } from "@ledgerhq/types-live";
import React, { useCallback } from "react";
import { useDispatch } from "react-redux";
import { openModal } from "~/renderer/actions/modals";
import { ReceiveActionDefault } from "~/renderer/screens/account/AccountActionsDefault";

interface Props {
  account: TokenAccount | Account;
  parentAccount: Account | null | undefined;
  onClick: () => void;
}

const ReceiveAction = ({ account, parentAccount, onClick }: Props) => {
  const dispatch = useDispatch();

  const onClickDecorated = useCallback(() => {
    dispatch(openModal("MODAL_HEDERA_RECEIVE", { account, parentAccount }));
  }, [dispatch, onClick]);

  return <ReceiveActionDefault onClick={onClickDecorated} />;
};

export default {
  ReceiveAction,
};
