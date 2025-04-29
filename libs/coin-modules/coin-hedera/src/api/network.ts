import BigNumber from "bignumber.js";
import type { Transaction as HederaTransaction, TransactionResponse } from "@hashgraph/sdk";
import {
  Client,
  TransferTransaction,
  Hbar,
  AccountId,
  TransactionId,
  AccountBalanceQuery,
  HbarUnit,
} from "@hashgraph/sdk";
import { Account, TokenAccount } from "@ledgerhq/types-live";
import { HederaAddAccountError } from "../errors";
import { Transaction } from "../types";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";

export function broadcastTransaction(transaction: HederaTransaction): Promise<TransactionResponse> {
  return transaction.execute(getClient());
}

async function buildUnsignedCoinTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TransferTransaction> {
  const accountId = account.freshAddress;
  const hbarAmount = Hbar.fromTinybars(transaction.amount);

  return new TransferTransaction()
    .setNodeAccountIds([new AccountId(3)])
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .addHbarTransfer(accountId, hbarAmount.negated())
    .addHbarTransfer(transaction.recipient, hbarAmount)
    .freeze();
}

async function buildUnsignedTokenTransaction({
  account,
  tokenAccount,
  transaction,
}: {
  account: Account;
  tokenAccount: TokenAccount;
  transaction: Transaction;
}): Promise<TransferTransaction> {
  const accountId = account.freshAddress;
  const tokenId = tokenAccount.token.contractAddress;

  console.log("[DEBUG] buildUnsignedTokenTransaction", {
    negatedAmount: transaction.amount,
    amount: transaction.amount,
  });

  return (
    new TransferTransaction()
      .setNodeAccountIds([new AccountId(3)])
      .setTransactionId(TransactionId.generate(accountId))
      .setTransactionMemo(transaction.memo ?? "")
      // FIXME: verify if .toNumber() is enough or if "Long" should be used
      .addTokenTransfer(tokenId, accountId, transaction.amount.negated().toNumber())
      .addTokenTransfer(tokenId, transaction.recipient, transaction.amount.toNumber())
      .freeze()
  );
}

export async function buildUnsignedTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TransferTransaction> {
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);

  console.log("[DEBUG] buildUnsignedTransaction", {
    isTokenTransaction,
    account,
    subAccount,
    transaction,
  });

  if (isTokenTransaction) {
    return buildUnsignedTokenTransaction({ account, tokenAccount: subAccount, transaction });
  } else {
    return buildUnsignedCoinTransaction({ account, transaction });
  }
}

export interface AccountBalance {
  balance: BigNumber;
  tokens: {
    tokenId: string;
    balance: BigNumber;
    decimals: number;
  }[];
}

export async function getAccountBalance(address: string): Promise<AccountBalance> {
  const accountId = AccountId.fromString(address);
  let accountBalance;

  try {
    accountBalance = await new AccountBalanceQuery({
      accountId,
    }).execute(getBalanceClient());
  } catch {
    throw new HederaAddAccountError();
  }

  return {
    balance: accountBalance.hbars.to(HbarUnit.Tinybar),
    tokens: accountBalance.toJSON().tokens.map(token => ({
      tokenId: token.tokenId,
      balance: BigNumber(token.balance).dividedBy(10 ** token.decimals),
      decimals: token.decimals,
    })),
  };
}

let _hederaClient: Client | null = null;

let _hederaBalanceClient: Client | null = null;

function getClient(): Client {
  _hederaClient ??= Client.forMainnet().setMaxNodesPerTransaction(1);

  //_hederaClient.setNetwork({ mainnet: "https://hedera.coin.ledger.com" });

  return _hederaClient;
}

function getBalanceClient(): Client {
  _hederaBalanceClient ??= Client.forMainnet();

  return _hederaBalanceClient;
}
