import React from "react";
import { useTranslation } from "react-i18next";
import { findTokenByAddress } from "@ledgerhq/live-common/currencies/index";
import { getTransactionExplorer } from "@ledgerhq/live-common/families/hedera/logic";
import type { HederaAccount, HederaOperation } from "@ledgerhq/live-common/families/hedera/types";
import type { OperationType } from "@ledgerhq/types-live";
import Section from "~/screens/OperationDetails/Section";

interface OperationDetailsPostAccountSectionProps {
  operation: HederaOperation;
  type: OperationType;
  account: HederaAccount;
}

function OperationDetailsPostAccountSection({
  operation,
}: OperationDetailsPostAccountSectionProps) {
  const { t } = useTranslation();

  if (operation.type !== "ASSOCIATE_TOKEN") {
    return null;
  }

  const token = operation.extra.associatedTokenId
    ? findTokenByAddress(operation.extra.associatedTokenId)
    : null;

  if (!token) {
    return null;
  }

  return (
    <Section
      title={t("hedera.operationDetails.postAccountSection")}
      value={`${token.contractAddress} (${token.name})`}
    />
  );
}

export default { OperationDetailsPostAccountSection, getTransactionExplorer };
