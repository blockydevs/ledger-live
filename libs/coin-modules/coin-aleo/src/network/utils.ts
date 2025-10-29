import { Operation, OperationType } from "@ledgerhq/types-live";
import { AleoMirrorTransaction } from "../types";
import BigNumber from "bignumber.js";

export function parseTransfer(
  transfer: AleoMirrorTransaction,
  address: string,
): Pick<Operation, "type" | "value" | "senders" | "recipients"> {
  let value = new BigNumber(0);
  let type: OperationType = "NONE";

  const senders: string[] = [];
  const recipients: string[] = [];

  const amount = new BigNumber(transfer.amount);
  // FIXME: sender address as ID ?
  // const accountId = transfer.sender_address;

  if (transfer.sender_address === address) {
    value = amount.abs();
    type = amount.isNegative() ? "OUT" : "IN";
  }

  if (amount.isNegative()) {
    senders.push(transfer.sender_address);
    //   FIXME: valudate recipient
  } else if (transfer.recipient_address.length > 0) {
    recipients.push(transfer.recipient_address);
  }

  // NOTE: earlier addresses are the "fee" addresses // LO
  //   senders.reverse();
  //   recipients.reverse();

  return {
    type,
    value,
    senders,
    recipients,
  };
}
