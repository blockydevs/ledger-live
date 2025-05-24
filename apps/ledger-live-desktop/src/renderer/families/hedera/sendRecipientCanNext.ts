import type { TransactionStatus } from "@ledgerhq/live-common/generated/types";

export const sendRecipientCanNext = (status: TransactionStatus) => {
  const { missingAssociation, unverifiedAssociation } = status.warnings;

  return !!missingAssociation || !!unverifiedAssociation;
};
