import { rejectBalanceOptions } from "@ledgerhq/coin-module-framework/api/getBalance/rejectBalanceOptions";
import type {
  CoinModuleApi,
  BalanceOptions,
  CraftedTransaction,
  Operation,
} from "@ledgerhq/coin-module-framework/api/index";
import { BridgeApi } from "@ledgerhq/ledger-wallet-framework/api/types";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import { craftTransactionData } from "../logic/craftTransactionData";
import { validateAddress } from "../logic/validateAddress";
import hederaCoinConfig, { type HederaCoinConfig, type HederaConfig } from "../config";
import { HARDCODED_BLOCK_HEIGHT, HEDERA_OPERATION_TYPES } from "../constants";
import {
  combine,
  craftTransaction,
  getBalance,
  getBlockInfo,
  getBlockV2,
  getRewards,
  getStakes,
  getValidators,
  lastBlockV2,
  broadcast as logicBroadcast,
  estimateFees as logicEstimateFees,
  listOperationsV2 as logicListOperationsV2,
  validateIntent as logicValidateIntent,
} from "../logic";
import {
  base64ToUrlSafeBase64,
  extractInitiator,
  getBlockHash,
  getDateRangeFromBlockHeight,
  getOperationValue,
  mapIntentToSDKOperation,
} from "../logic/utils";
import { apiClient } from "../network/api";
import { getERC20BalancesForAccountV2, toEVMAddress } from "../network/utils";
import type { EstimateFeesParams, HederaMemo, HederaTxData } from "../types";

export function createApi(
  config: HederaConfig,
  currencyId: string,
): CoinModuleApi<HederaMemo, HederaTxData> & BridgeApi {
  const coinConfig: HederaCoinConfig = { ...config, status: { type: "active" } };
  hederaCoinConfig.setCoinConfig(() => coinConfig);

  return {
    broadcast: async tx => {
      const response = await logicBroadcast({
        configOrCurrencyId: coinConfig,
        txWithSignature: tx,
      });

      return base64ToUrlSafeBase64(Buffer.from(response.transactionHash).toString("base64"));
    },
    async call() {
      throw new Error("call is not supported");
    },
    combine,
    craftTransaction: async (txIntent, customFees) => {
      const { serializedTx } = await craftTransaction({
        configOrCurrencyId: coinConfig,
        txIntent,
        ...(customFees && { customFees }),
      });

      return {
        transaction: serializedTx,
      };
    },
    craftRawTransaction: (
      _transaction: string,
      _sender: string,
      _publicKey: string,
      _sequence: bigint,
    ): Promise<CraftedTransaction> => {
      throw new Error("craftRawTransaction is not supported");
    },
    estimateFees: async txIntent => {
      let estimateFeesParams: EstimateFeesParams;
      const operationType = mapIntentToSDKOperation(txIntent);

      if (operationType === HEDERA_OPERATION_TYPES.ContractCall) {
        estimateFeesParams = { configOrCurrencyId: coinConfig, operationType, txIntent };
      } else {
        estimateFeesParams = { currencyId, operationType };
      }

      const estimatedFee = await logicEstimateFees(estimateFeesParams);

      return {
        value: BigInt(estimatedFee.tinybars.toString()),
        ...(estimatedFee.gas && {
          parameters: { gasLimit: BigInt(estimatedFee.gas.toString()) },
        }),
      };
    },
    getBalance: (address: string, options?: BalanceOptions) =>
      rejectBalanceOptions(() => getBalance({ config: coinConfig, currencyId, address }), options),
    getBlock: height => {
      return getBlockV2({ configOrCurrencyId: coinConfig, height });
    },
    getBlockInfo: height => getBlockInfo(height),
    lastBlock: () => {
      return lastBlockV2({ configOrCurrencyId: coinConfig });
    },
    listOperations: async (address, { cursor, limit, order, minHeight }) => {
      // The framework never writes back `oldOps[0].extra.pagingToken` as a cursor on
      // incremental syncs, so `minHeight` — the synthetic block height of the last known
      // operation, plus one — is what actually bounds the sync. A synthetic block spans
      // `SYNTHETIC_BLOCK_WINDOW_SECONDS`, so several operations can share the last known
      // op's own block height; starting the cursor at `minHeight` would skip the rest of
      // that block entirely. Starting one block earlier re-covers it (dedup happens
      // downstream via operation id) without losing anything newer. Converting it to the
      // mirror node's "seconds.nanoseconds" consensus-timestamp format keeps the sync
      // incremental instead of full, and keeps it comparable to the nanosecond-scale cursor
      // hgraph derives from this same string (see `getERC20Transfers`'s
      // `timestamp?.replace(".", "")`).
      const effectiveCursor =
        cursor ??
        (minHeight > 0
          ? `${Math.floor(getDateRangeFromBlockHeight(minHeight - 1).start.getTime() / 1000)}.000000000`
          : undefined);

      // A synthesized cursor marks a point in the past, not a page boundary: the mirror
      // node request must ask for what comes after it ("gt"), not before it ("lt"). The
      // request direction is derived from `order`, so an incremental sync has to fetch
      // ascending here regardless of the descending order the caller wants for display;
      // the operations are re-sorted into that order below.
      const isSynthesizedCursor = !cursor && minHeight > 0;
      const fetchOrder = isSynthesizedCursor ? "asc" : order;

      const evmAddress = await toEVMAddress({
        configOrCurrencyId: coinConfig,
        accountId: address,
      });
      invariant(evmAddress, `hedera: evm address is missing for ${address}`);
      const [mirrorTokens, erc20TokenBalances] = await Promise.all([
        apiClient.getAccountTokens({ configOrCurrencyId: coinConfig, address }),
        getERC20BalancesForAccountV2({ configOrCurrencyId: coinConfig, address }),
      ]);

      const latestAccountOperations = await logicListOperationsV2({
        config: coinConfig,
        currencyId,
        address,
        evmAddress,
        mirrorTokens,
        ...(typeof effectiveCursor === "string" && { cursor: effectiveCursor }),
        ...(typeof limit === "number" && { limit }),
        ...(typeof fetchOrder === "string" && { order: fetchOrder }),
        tokenEvmAddresses: erc20TokenBalances.map(t => t.contractAddress.toLowerCase()),
        fetchAllPages: false,
        skipFeesForTokenOperations: true,
        useEncodedHash: true,
        useSyntheticBlocks: true,
      });

      const liveOperations = [
        ...latestAccountOperations.coinOperations,
        ...latestAccountOperations.tokenOperations,
      ];

      const sortedLiveOperations = [...liveOperations].sort((a, b) => {
        const aConsensusTime = a.extra.consensusTimestamp;
        const bConsensusTime = b.extra.consensusTimestamp;
        const aTime = a.date.getTime();
        const bTime = b.date.getTime();
        const dateDiff = order === "desc" ? bTime - aTime : aTime - bTime;

        if (aConsensusTime && bConsensusTime) {
          const aTime = new BigNumber(aConsensusTime);
          const bTime = new BigNumber(bConsensusTime);
          const timeDiff = order === "desc" ? bTime.minus(aTime) : aTime.minus(bTime);

          // REWARD operations have the same consensus time as operation that triggered them
          return timeDiff.isZero() ? dateDiff : timeDiff.toNumber();
        }

        return dateDiff;
      });

      const coinFrameworkOperations = sortedLiveOperations.map(liveOp => {
        const asset = liveOp.contract
          ? {
              type: liveOp.standard ?? "token",
              assetReference: liveOp.contract,
              assetOwner: address,
            }
          : { type: "native" };

        // Prefer inferred payer from operation extra, fallback to transaction_id parsing for legacy ops.
        let feePayer = liveOp.extra?.feePayer;
        if (!feePayer && liveOp.extra?.transactionId)
          feePayer = extractInitiator(liveOp.extra.transactionId);

        return {
          id: liveOp.id,
          type: liveOp.type,
          senders: liveOp.senders,
          recipients: liveOp.recipients,
          value: getOperationValue({ asset, operation: liveOp }),
          asset,
          details: {
            ...liveOp.extra,
            ledgerOpType: liveOp.type,
            ...(asset.type !== "native" && { assetAmount: liveOp.value.toFixed(0) }),
            ...(liveOp.extra.stakedAmount && {
              stakedAmount: BigInt(liveOp.extra.stakedAmount.toFixed(0)),
            }),
          },
          tx: {
            hash: liveOp.hash,
            fees: BigInt(liveOp.fee.toFixed(0)),
            ...(feePayer && { feesPayer: feePayer }),
            date: liveOp.date,
            block: {
              height: liveOp.blockHeight ?? HARDCODED_BLOCK_HEIGHT,
              hash: liveOp.blockHash ?? getBlockHash(liveOp.blockHeight ?? HARDCODED_BLOCK_HEIGHT),
              time: liveOp.date,
            },
            failed: liveOp.hasFailed ?? false,
          },
        } satisfies Operation;
      });

      return {
        items: coinFrameworkOperations,
        next: latestAccountOperations.nextCursor || undefined,
      };
    },
    getValidators: cursor => getValidators({ configOrCurrencyId: coinConfig, cursor }),
    getStakes: async address => getStakes({ configOrCurrencyId: coinConfig, address }),
    getRewards: async (address, cursor) =>
      getRewards({ configOrCurrencyId: coinConfig, address, cursor }),
    validateIntent: (transactionIntent, balances, customFees) =>
      logicValidateIntent(coinConfig, currencyId, transactionIntent, balances, customFees),
    getNextSequence: async (_address): Promise<bigint> => {
      throw new Error("getNextSequence is not supported");
    },
    validateAddress,
    craftTransactionData,
  };
}
