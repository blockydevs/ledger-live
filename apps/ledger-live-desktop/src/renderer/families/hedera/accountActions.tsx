import React, { useCallback } from "react";
import { useDispatch } from "react-redux";
import { openModal } from "~/renderer/actions/modals";
import { ReceiveActionDefault } from "~/renderer/screens/account/AccountActionsDefault";

interface Props {
  onClick: () => void;
}

const ReceiveAction = ({ onClick }: Props) => {
  const dispatch = useDispatch();

  const onClickDecorated = useCallback(() => {
    dispatch(openModal("MODAL_HEDERA_RECEIVE", {}));
  }, [dispatch, onClick]);

  return <ReceiveActionDefault onClick={onClickDecorated} />;
};

export default {
  ReceiveAction,
};
