import { BigNumber } from "bignumber.js";
import type { HederaValidator } from "@ledgerhq/live-common/families/hedera/types";

export const HEDERA_VALIDATOR_1: HederaValidator = {
  nodeId: 1,
  minStake: new BigNumber(1_000),
  maxStake: new BigNumber(1_000_000_000),
  activeStake: new BigNumber(500_000),
  activeStakePercentage: new BigNumber(5),
  address: "0.0.3",
  addressChecksum: null,
  name: "Node 1",
  overstaked: false,
};

export const HEDERA_VALIDATOR_2: HederaValidator = {
  ...HEDERA_VALIDATOR_1,
  nodeId: 2,
  name: "Node 2",
};
