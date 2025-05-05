import BigNumber from "bignumber.js";
import { AccountId } from "@hashgraph/sdk";
import { Operation, OperationType } from "@ledgerhq/types-live";
import { HederaMirrorTokenTransfer, HederaMirrorTransfer } from "./types";

function isValidRecipient(accountId: AccountId, recipients: string[]): boolean {
  if (accountId.shard.eq(0) && accountId.realm.eq(0)) {
    // account is a node, only add to list if we have none
    if (accountId.num.lt(100)) {
      return recipients.length === 0;
    }

    // account is a system account that is not a node, do NOT add
    if (accountId.num.lt(1000)) {
      return false;
    }
  }

  return true;
}

export function parseTransfers(
  transfers: (HederaMirrorTransfer | HederaMirrorTokenTransfer)[],
  address: string,
): Pick<Operation, "type" | "value" | "senders" | "recipients"> {
  let value = new BigNumber(0);
  let type: OperationType = "NONE";

  const senders: string[] = [];
  const recipients: string[] = [];

  for (const transfer of transfers) {
    const amount = new BigNumber(transfer.amount);
    const accountId = AccountId.fromString(transfer.account);

    if (transfer.account === address) {
      value = amount.abs();
      type = amount.isNegative() ? "OUT" : "IN";
    }

    if (amount.isNegative()) {
      senders.push(transfer.account);
    } else if (isValidRecipient(accountId, recipients)) {
      recipients.push(transfer.account);
    }
  }

  return {
    type,
    value,
    senders: senders.reverse(),
    recipients: recipients.reverse(),
  };
}
