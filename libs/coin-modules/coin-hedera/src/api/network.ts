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
  TokenAssociateTransaction,
} from "@hashgraph/sdk";
import { Account, TokenAccount } from "@ledgerhq/types-live";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";
import { HederaAddAccountError } from "../errors";
import { Transaction } from "../types";
import invariant from "invariant";

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

  return new TransferTransaction()
    .setNodeAccountIds([new AccountId(3)])
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .addTokenTransfer(tokenId, accountId, transaction.amount.negated().toNumber())
    .addTokenTransfer(tokenId, transaction.recipient, transaction.amount.toNumber())
    .freeze();
}

async function buildAssociateTokenTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TokenAssociateTransaction> {
  invariant(transaction.properties?.name === "tokenAssociate", "invalid transaction type");

  const accountId = account.freshAddress;

  return new TokenAssociateTransaction()
    .setNodeAccountIds([new AccountId(3)])
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .setAccountId(accountId)
    .setTokenIds([transaction.properties.token.contractAddress])
    .freeze();
}

export async function buildUnsignedTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TransferTransaction | TokenAssociateTransaction> {
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);

  if (transaction.properties?.name === "tokenAssociate") {
    return buildAssociateTokenTransaction({ account, transaction });
  } else if (isTokenTransaction) {
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
      balance: BigNumber(token.balance),
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
