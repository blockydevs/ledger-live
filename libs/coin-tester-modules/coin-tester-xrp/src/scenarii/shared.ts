import BigNumber from "bignumber.js";
import type { Account, Operation, OperationType, TokenAccount } from "@ledgerhq/types-live";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import type { XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import type { XrplWallet } from "../rippled";

const TX_FEE_DROPS = new BigNumber(10);

/** The XRP family accepts this mode, but the generic transaction type does not list it. */
export const OPT_OUT_MODE = "optOut" as GenericTransaction["mode"];

export function getSubAccount(account: Account, id: string): TokenAccount {
  const found = account.subAccounts?.find(sub => sub.id === id);
  if (!found) throw new Error(`no sub-account ${id}`);

  return found;
}

function getFeesOperation(account: Account, hash: string): Operation {
  const found = account.operations.find(op => op.hash === hash);
  if (!found) throw new Error(`no parent operation ${hash}`);

  return found;
}

export function countOperations(account: Account, type: OperationType): number {
  return account.operations.filter(op => op.type === type).length;
}

/** Asserts a successful token op of `value`, from `from` to `to` and no one else. */
export function expectTokenOperation(
  operation: Operation,
  {
    type,
    from,
    to,
    value,
  }: { type: OperationType; from: XrplWallet; to: XrplWallet; value: BigNumber },
): void {
  expect(operation.type).toBe(type);
  expect(operation.hasFailed).toBe(false);
  expect(operation.senders).toStrictEqual([from.address]);
  expect(operation.recipients).toStrictEqual([to.address]);
  expect(operation.value).toStrictEqual(value);
}

/**
 * Asserts the latest op of `subAccountId` is one new `OUT` from `holder` to `recipient`, with its
 * fee paid in XRP on the parent account. Returns that op.
 */
export function expectSentByHolder(
  previous: Account,
  current: Account,
  subAccountId: string,
  { holder, recipient }: { holder: XrplWallet; recipient: XrplWallet },
): Operation {
  const previousSub = getSubAccount(previous, subAccountId);
  const sub = getSubAccount(current, subAccountId);
  expect(sub.operations.length - previousSub.operations.length).toBe(1);
  const [sent] = sub.operations;
  expectTokenOperation(sent, { type: "OUT", from: holder, to: recipient, value: sent.value });

  const fees = getFeesOperation(current, sent.hash);
  expect(current.operations.length - previous.operations.length).toBe(1);
  expect(fees.type).toBe("FEES");
  expect(fees.fee).toStrictEqual(TX_FEE_DROPS);
  expect(fees.value).toStrictEqual(fees.fee);
  expect(fees.subOperations?.map(({ id }) => id)).toStrictEqual([sent.id]);
  expect(current.balance).toStrictEqual(previous.balance.minus(fees.fee));

  return sent;
}

/**
 * Asserts one new `OPT_OUT` from `holder` on the parent account, fee paid in XRP. The sub-account of
 * the removed token stays at 0 with its history, and no longer has `xrpResources`.
 */
export function expectOptedOutByHolder(
  previous: Account,
  current: Account,
  subAccountId: string,
  holder: XrplWallet,
): void {
  const [optOut] = current.operations;
  expect(current.operations.length - previous.operations.length).toBe(1);
  expect(optOut.type).toBe("OPT_OUT");
  expect(optOut.hasFailed).toBe(false);
  expect(optOut.senders).toStrictEqual([holder.address]);
  expect(optOut.fee).toStrictEqual(TX_FEE_DROPS);
  expect(current.balance).toStrictEqual(previous.balance.minus(optOut.fee));

  const sub = getSubAccount(current, subAccountId) as XrpTokenAccount;
  expect(sub.balance.toFixed()).toBe("0");
  expect(sub.xrpResources).toBeUndefined();
  const previousOperationIds = getSubAccount(previous, subAccountId).operations.map(({ id }) => id);
  expect(sub.operations.map(({ id }) => id)).toStrictEqual(previousOperationIds);
}
