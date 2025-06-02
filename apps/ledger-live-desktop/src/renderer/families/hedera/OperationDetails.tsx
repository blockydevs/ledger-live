import React from "react";
import { Account, Operation, OperationType } from "@ledgerhq/types-live";
import Alert from "~/renderer/components/Alert";
import { Trans } from "react-i18next";
import { Link } from "@ledgerhq/react-ui";
import { openURL } from "~/renderer/linking";
import { urls } from "~/config/urls";
import { track } from "~/renderer/analytics/segment";
import { useDispatch } from "react-redux";
import { openModal } from "~/renderer/actions/modals";

interface Props {
  operation: Operation;
  account: Account;
  type: OperationType;
}

const OperationDetailsPostAlert = ({ account, operation }: Props) => {
  const dispatch = useDispatch();

  const openLearnMore = () => {
    openURL(urls.hedera.tokenAssociation);
    track("Hedera Token Association Operation Details - learn more");
  };

  const triggerAssociate = () => {
    dispatch(
      openModal("MODAL_RECEIVE", {
        account,
        receiveTokenMode: true,
      }),
    );
  };

  if (operation.type !== "TOKEN_ASSOCIATE") {
    return null;
  }

  return (
    <Alert type="primary">
      <Trans i18nKey="hedera.operationDetails.postAlert">
        <Link onClick={triggerAssociate} color="inherit" textProps={{ fontWeight: "medium" }} />
        <Link onClick={openLearnMore} color="inherit" textProps={{ fontWeight: "medium" }} />
      </Trans>
    </Alert>
  );
};

export default {
  OperationDetailsPostAlert,
};
