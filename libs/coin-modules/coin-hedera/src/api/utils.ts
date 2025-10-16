import BigNumber from "bignumber.js";
import { AccountId } from "@hashgraph/sdk";
import type { Operation, OperationType } from "@ledgerhq/types-live";
import { encodeOperationId } from "@ledgerhq/coin-framework/operation";
import { encodeTokenAccountId } from "@ledgerhq/coin-framework/account";
import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets";
import { base64ToUrlSafeBase64 } from "../bridge/utils";
import { getMemoFromBase64 } from "../logic";
import {
  getAccountTransactions,
  getMirrorTransactionForContractCallResult,
  getContractCallResult,
} from "./mirror";
import { getAccountERC20Transactions } from "./thirdweb-mirror";
import type {
  HederaMirrorTokenTransfer,
  HederaMirrorCoinTransfer,
  HederaERC20TokenBalance,
} from "./types";
import type { HederaOperationExtra, OperationERC20 } from "../types";

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
  mirrorTransfers: (HederaMirrorCoinTransfer | HederaMirrorTokenTransfer)[],
  address: string,
): Pick<Operation, "type" | "value" | "senders" | "recipients"> {
  let value = new BigNumber(0);
  let type: OperationType = "NONE";

  const senders: string[] = [];
  const recipients: string[] = [];

  for (const transfer of mirrorTransfers) {
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

  // NOTE: earlier addresses are the "fee" addresses
  senders.reverse();
  recipients.reverse();

  return {
    type,
    value,
    senders,
    recipients,
  };
}

const customOperationTypeByTxName: Record<string, OperationType> = {
  TOKENASSOCIATE: "ASSOCIATE_TOKEN",
  CONTRACTCALL: "CONTRACT_CALL",
};

export async function getOperationsForAccount({
  ledgerAccountId,
  address,
  latestOperationTimestamp,
  erc20LatestOperationTimestamp,
  erc20TokenBalances,
  pendingOperationHashes,
  erc20OperationHashes,
}: {
  ledgerAccountId: string;
  address: string;
  latestOperationTimestamp: string | null;
  erc20LatestOperationTimestamp: string | null;
  erc20TokenBalances: HederaERC20TokenBalance[];
  pendingOperationHashes: Set<string>;
  erc20OperationHashes: Set<string>;
}): Promise<{
  coinOperations: Operation[];
  tokenOperations: Operation[];
  erc20Operations: OperationERC20[];
}> {
  const erc20Operations: OperationERC20[] = [];
  const coinOperations: Operation[] = [];
  const tokenOperations: Operation[] = [];
  const erc20TokenAddresses = erc20TokenBalances.map(token => token.token.contractAddress);
  const blockHeight = 5;
  const blockHash = null;

  const [mirrorTransactions, thirdwebTransactions] = await Promise.all([
    getAccountTransactions(address, latestOperationTimestamp),
    getAccountERC20Transactions({
      address,
      tokens: erc20TokenAddresses,
      since: erc20LatestOperationTimestamp,
    }),
  ]);

  for (const rawTx of mirrorTransactions) {
    const timestamp = new Date(parseInt(rawTx.consensus_timestamp.split(".")[0], 10) * 1000);
    const hash = base64ToUrlSafeBase64(rawTx.transaction_hash);
    const fee = new BigNumber(rawTx.charged_tx_fee);
    const tokenTransfers = rawTx.token_transfers ?? [];
    const transfers = rawTx.transfers ?? [];
    const hasFailed = rawTx.result !== "SUCCESS";
    const memo = getMemoFromBase64(rawTx.memo_base64);
    const commonExtra = {
      ...(memo && { memo }),
      consensusTimestamp: rawTx.consensus_timestamp,
      transactionId: rawTx.transaction_id,
    } satisfies HederaOperationExtra;

    if (tokenTransfers.length > 0) {
      const tokenId = rawTx.token_transfers[0].token_id;
      const token = findTokenByAddressInCurrency(tokenId, "hedera");
      if (!token) continue;

      const encodedTokenId = encodeTokenAccountId(ledgerAccountId, token);
      const { type, value, senders, recipients } = parseTransfers(rawTx.token_transfers, address);

      // add main FEES coin operation for send token transfer
      if (type === "OUT") {
        coinOperations.push({
          id: encodeOperationId(ledgerAccountId, hash, "FEES"),
          accountId: ledgerAccountId,
          type: "FEES",
          value: fee,
          recipients,
          senders,
          hash,
          fee,
          date: timestamp,
          blockHeight,
          blockHash,
          hasFailed,
          extra: commonExtra,
        });
      }

      tokenOperations.push({
        id: encodeOperationId(encodedTokenId, hash, type),
        accountId: encodedTokenId,
        type,
        value,
        recipients,
        senders,
        hash,
        fee,
        date: timestamp,
        blockHeight,
        blockHash,
        hasFailed,
        extra: commonExtra,
      });
    } else if (transfers.length > 0) {
      const { type, value, senders, recipients } = parseTransfers(rawTx.transfers, address);
      const operationType = customOperationTypeByTxName[rawTx.name] ?? type;

      // skip adding mirror node CONTRACT_CALL transaction if we:
      // - already have matching ERC20 operation, this may happen because `timestamp` (used for incremental sync) does not have nanoseconds precision
      // - already have pending operation with the same hash (we don't want to override FEES with CONTRACT_CALL)
      const hashAlreadyExists = erc20OperationHashes.has(hash) || pendingOperationHashes.has(hash);
      if (operationType === "CONTRACT_CALL" && hashAlreadyExists) {
        continue;
      }

      coinOperations.push({
        id: encodeOperationId(ledgerAccountId, hash, operationType),
        accountId: ledgerAccountId,
        type: operationType,
        value,
        recipients,
        senders,
        hash,
        fee,
        date: timestamp,
        blockHeight,
        blockHash,
        hasFailed,
        extra: commonExtra,
      });
    }
  }

  // build a list of erc20 transactions with related mirror transaction
  for (const thirdwebTransaction of thirdwebTransactions) {
    const tokenId = thirdwebTransaction.address;
    const token = findTokenByAddressInCurrency(tokenId, "hedera");

    if (!token) continue;

    const hash = thirdwebTransaction.transactionHash;
    const contractCallResult = await getContractCallResult(hash);
    const mirrorTransaction = await getMirrorTransactionForContractCallResult(
      contractCallResult.timestamp,
      contractCallResult.contract_id,
    );

    if (!mirrorTransaction) continue;

    erc20Operations.push({ thirdwebTransaction, mirrorTransaction, contractCallResult, token });
  }

  coinOperations.sort((a, b) => b.date.getTime() - a.date.getTime());
  tokenOperations.sort((a, b) => b.date.getTime() - a.date.getTime());

  return { coinOperations, tokenOperations, erc20Operations };
}
