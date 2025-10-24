import {
  Api,
  Block,
  BlockInfo,
  Cursor,
  Page,
  Stake,
  Reward,
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
  listOperations,
} from "../logic";

export function createApi(config: AleoConfig): Api {
  coinConfig.setCoinConfig(() => ({ ...config, status: { type: "active" } }));

  return {
    broadcast,
    combine,
    craftTransaction,
    estimateFees,
    getBalance,
    lastBlock,
    listOperations,
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
    validateIntent,
    getSequence: async (_address: string) => {
      throw new Error("getSequence is not supported");
    },
  };
}
