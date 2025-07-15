import BigNumber from "bignumber.js";
import type { Transaction as HederaTransaction, TransactionResponse } from "@hashgraph/sdk";
import { Client, TransferTransaction, Hbar, AccountId, TransactionId } from "@hashgraph/sdk";
import { Account } from "@ledgerhq/types-live";
import { Transaction } from "../types";

export function broadcastTransaction(transaction: HederaTransaction): Promise<TransactionResponse> {
  return transaction.execute(getClient());
}

export async function buildUnsignedTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TransferTransaction> {
  const hbarAmount = Hbar.fromTinybars(transaction.amount);
  const accountId = account.freshAddress;

  const tx = new TransferTransaction()
    .setNodeAccountIds([new AccountId(3)])
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .addHbarTransfer(accountId, hbarAmount.negated())
    .addHbarTransfer(transaction.recipient, hbarAmount);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freeze();
}

export interface AccountBalance {
  balance: BigNumber;
}

let _hederaClient: Client | null = null;

function getClient(): Client {
  _hederaClient ??= Client.forMainnet().setMaxNodesPerTransaction(1);

  //_hederaClient.setNetwork({ mainnet: "https://hedera.coin.ledger.com" });

  return _hederaClient;
}
