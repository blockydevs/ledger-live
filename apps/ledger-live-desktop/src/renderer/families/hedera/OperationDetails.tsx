import React from "react";
import { Account, Operation, OperationType } from "@ledgerhq/types-live";
import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets";
import { isValidExtra } from "@ledgerhq/live-common/families/hedera/logic";
import { HederaOperation } from "@ledgerhq/live-common/families/hedera/types";
import Alert from "~/renderer/components/Alert";
import { Trans } from "react-i18next";
import { Link } from "@ledgerhq/react-ui";
import { openURL } from "~/renderer/linking";
import { urls } from "~/config/urls";
import { track } from "~/renderer/analytics/segment";
import { useDispatch } from "react-redux";
import { openModal } from "~/renderer/actions/modals";
import { AddressCellProps } from "~/renderer/families/types";
import { Cell } from "~/renderer/components/OperationsList/AddressCell";
import Box from "~/renderer/components/Box";

interface Props {
  operation: Operation;
  account: Account;
  type: OperationType;
}

const OperationDetailsPostAlert = ({ account, operation }: Props) => {
  const dispatch = useDispatch();

  if (operation.type !== "ASSOCIATE_TOKEN") {
    return null;
  }

  const extra = isValidExtra(operation.extra) ? operation.extra : null;
  const associatedTokenId = extra?.associatedTokenId;
  const token = associatedTokenId
    ? findTokenByAddressInCurrency(associatedTokenId, "hedera")
    : null;

  if (!token) {
    return null;
  }

  const tokenAccount = account.subAccounts?.find(
    a => a.token.contractAddress === token.contractAddress,
  );

  const openLearnMore = () => {
    openURL(urls.hedera.tokenAssociation);
    track("Hedera Token Association Operation Details - learn more");
  };

  const triggerAssociate = () => {
    dispatch(
      openModal(
        "MODAL_RECEIVE",
        tokenAccount ? { account: tokenAccount, parentAccount: account } : { account },
      ),
    );
  };

  return (
    <Alert type="primary">
      <Trans i18nKey="hedera.operationDetails.postAlert">
        <Link onClick={triggerAssociate} color="inherit" textProps={{ fontWeight: "medium" }} />
        <Link onClick={openLearnMore} color="inherit" textProps={{ fontWeight: "medium" }} />
      </Trans>
    </Alert>
  );
};

const AddressCell = ({ operation }: AddressCellProps<HederaOperation>) => {
  const token = operation.extra.associatedTokenId
    ? findTokenByAddressInCurrency(operation.extra.associatedTokenId, "hedera")
    : null;

  if (!token) {
    return null;
  }

  return (
    <Cell>
      <Box color="palette.text.shade80" ff="Inter" fontSize={3}>
        {token.contractAddress} ({token.name})
      </Box>
    </Cell>
  );
};

const addressCell = {
  ASSOCIATE_TOKEN: AddressCell,
} satisfies Partial<Record<OperationType, unknown>>;

export default {
  OperationDetailsPostAlert,
  addressCell,
};
