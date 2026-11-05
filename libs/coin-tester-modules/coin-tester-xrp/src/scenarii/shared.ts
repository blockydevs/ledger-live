import BigNumber from "bignumber.js";
import type { Account, Operation, OperationType, TokenAccount } from "@ledgerhq/types-live";
import type { XrplWallet } from "../rippled";

const TX_FEE_DROPS = new BigNumber(10);

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
  expect(sent.type).toBe("OUT");
  expect(sent.hasFailed).toBe(false);
  expect(sent.senders).toStrictEqual([holder.address]);
  expect(sent.recipients).toStrictEqual([recipient.address]);

  const fees = getFeesOperation(current, sent.hash);
  expect(current.operations.length - previous.operations.length).toBe(1);
  expect(fees.type).toBe("FEES");
  expect(fees.fee).toStrictEqual(TX_FEE_DROPS);
  expect(fees.value).toStrictEqual(fees.fee);
  expect(current.balance).toStrictEqual(previous.balance.minus(fees.fee));

  return sent;
}
