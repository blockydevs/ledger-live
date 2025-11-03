import {
  Api,
  Block,
  BlockInfo,
  Cursor,
  Page,
  Stake,
  Reward,
  Validator,
  CraftedTransaction,
  Balance,
  Operation,
} from "@ledgerhq/coin-framework/api/index";
import coinConfig, { type AleoConfig } from "../config";
import {
  broadcast,
  combine,
  craftTransaction,
  estimateFees,
  getBalance,
  validateIntent,
  lastBlock,
  listOperations as logicListOperations,
} from "../logic";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets/currencies";
import { getOperationValue } from "../logic/utils";

export function createApi(config: AleoConfig, currencyId: string): Api {
  coinConfig.setCoinConfig(() => ({ ...config, status: { type: "active" } }));
  const currency = getCryptoCurrencyById(currencyId);

  return {
    broadcast,
    combine,
    craftTransaction,
    craftRawTransaction: (
      _transaction: string,
      _sender: string,
      _publicKey: string,
      _sequence: number,
    ): Promise<CraftedTransaction> => {
      throw new Error("craftRawTransaction is not supported");
    },
    estimateFees,
    getBalance: (address: string): Promise<Balance[]> => getBalance(currency, address),
    lastBlock,
    listOperations: async (address, pagination) => {
      // const mirrorTokens = await apiClient.getAccountTokens(address);
      const latestAccountOperations = await logicListOperations({
        currency,
        address,
        pagination,
        // mirrorTokens,
        fetchAllPages: false,
        skipFeesForTokenOperations: true,
        useEncodedHash: false,
        useSyntheticBlocks: true,
      });

      const liveOperations = latestAccountOperations.coinOperations;

      const sortedLiveOperations = [...liveOperations].sort((a, b) => {
        const aTime = a.date.getTime();
        const bTime = b.date.getTime();
        return pagination.order === "desc" ? bTime - aTime : aTime - bTime;
      });

      const alpacaOperations = sortedLiveOperations.map(liveOp => {
        const asset = liveOp.contract
          ? {
              type: liveOp.standard ?? "token",
              assetReference: liveOp.contract,
              assetOwner: address,
            }
          : { type: "native" };

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
            status: liveOp.hasFailed ? "failed" : "success",
            ...(asset.type !== "native" && { assetAmount: liveOp.value.toFixed(0) }),
          },
          tx: {
            hash: liveOp.hash,
            fees: BigInt(liveOp.fee.toFixed(0)),
            date: liveOp.date,
            block: {
              height: liveOp.blockHeight ?? 10,
            },
          },
        } satisfies Operation;
      });

      // FIXME: nextCursor
      return [alpacaOperations, ""];
    },
    getBlock(_height): Promise<Block> {
      throw new Error("getBlock is not supported");
    },
    getBlockInfo(_height: number): Promise<BlockInfo> {
      throw new Error("getBlockInfo is not supported");
    },
    getStakes(_address: string, _cursor?: Cursor): Promise<Page<Stake>> {
      throw new Error("getStakes is not supported");
    },
    getRewards(_address: string, _cursor?: Cursor): Promise<Page<Reward>> {
      throw new Error("getRewards is not supported");
    },
    getValidators(_cursor?: Cursor): Promise<Page<Validator>> {
      throw new Error("getValidators is not supported");
    },
    validateIntent,
    getSequence: async (_address: string) => {
      throw new Error("getSequence is not supported");
    },
  };
}
