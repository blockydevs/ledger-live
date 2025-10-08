import BigNumber from "bignumber.js";
import { AccountId } from "@hashgraph/sdk";
import { getEnv } from "@ledgerhq/live-env";
import type { Operation, OperationType } from "@ledgerhq/types-live";
import { encodeOperationId } from "@ledgerhq/coin-framework/operation";
import { encodeTokenAccountId } from "@ledgerhq/coin-framework/account";
import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets";
import { base64ToUrlSafeBase64 } from "../bridge/utils";
import { getMemo } from "../logic";
import { getAccountTransactions } from "./mirror";
import type { HederaMirrorTokenTransfer, HederaMirrorCoinTransfer } from "./types";
import { HederaOperationExtra } from "../types";

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

export async function getOperationsForAccount(
  ledgerAccountId: string,
  address: string,
  latestOperationTimestamp: string | null,
): Promise<{
  coinOperations: Operation[];
  tokenOperations: Operation[];
}> {
  const mirrorTransactions = await getAccountTransactions(address, latestOperationTimestamp);
  const coinOperations: Operation[] = [];
  const tokenOperations: Operation[] = [];

  for (const rawTx of mirrorTransactions) {
    const timestamp = new Date(parseInt(rawTx.consensus_timestamp.split(".")[0], 10) * 1000);
    const hash = base64ToUrlSafeBase64(rawTx.transaction_hash);
    const fee = new BigNumber(rawTx.charged_tx_fee);
    const tokenTransfers = rawTx.token_transfers ?? [];
    const transfers = rawTx.transfers ?? [];
    const hasFailed = rawTx.result !== "SUCCESS";
    const commonExtra: HederaOperationExtra = {
      consensusTimestamp: rawTx.consensus_timestamp,
      memo: getMemo(rawTx),
    };

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
          blockHeight: 5,
          blockHash: null,
          hasFailed,
          extra: {
            ...commonExtra,
          },
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
        blockHeight: 5,
        blockHash: null,
        hasFailed,
        extra: {
          ...commonExtra,
        },
      });
    } else if (transfers.length > 0) {
      const { type, value, senders, recipients } = parseTransfers(rawTx.transfers, address);
      let operationType: OperationType = type;
      const stakingReward = rawTx.staking_reward_transfers.reduce((acc, transfer) => {
        const transferAmount = new BigNumber(transfer.amount);

        if (transfer.account === address) {
          acc = acc.plus(transferAmount);
        }

        return acc;
      }, new BigNumber(0));

      if (rawTx.name === "TOKENASSOCIATE") {
        operationType = "ASSOCIATE_TOKEN";
      }

      if (rawTx.name === "CRYPTOUPDATEACCOUNT") {
        operationType = "UPDATE_ACCOUNT";
      }

      if (stakingReward.gt(0)) {
        // offset timestamp by +1ms to ensure it appears just before the triggering operation in the list
        const stakingRewardTimestamp = new Date(timestamp.getTime() + 1);
        const stakingRewardHash = `${hash}-staking-reward`;
        const stakingRewardType: OperationType = "REWARD";

        coinOperations.push({
          id: encodeOperationId(ledgerAccountId, stakingRewardHash, stakingRewardType),
          accountId: ledgerAccountId,
          type: stakingRewardType,
          value: stakingReward,
          recipients: [address],
          senders: [getEnv("HEDERA_STAKING_REWARD_ACCOUNT_ID")],
          hash: stakingRewardHash,
          fee: new BigNumber(0),
          date: stakingRewardTimestamp,
          blockHeight: 5,
          blockHash: null,
          extra: {
            ...commonExtra,
          },
        });
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
        blockHeight: 5,
        blockHash: null,
        hasFailed,
        extra: {
          ...commonExtra,
        },
      });
    }
  }

  return { coinOperations, tokenOperations };
}
