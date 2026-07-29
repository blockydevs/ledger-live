import { BigNumber } from "bignumber.js";
import type { HederaValidator } from "@ledgerhq/live-common/families/hedera/types";

export const HEDERA_VALIDATOR_1: HederaValidator = {
  nodeId: 0,
  minStake: new BigNumber(0),
  maxStake: new BigNumber("50000000000000"),
  activeStake: new BigNumber("10000000000000"),
  activeStakePercentage: new BigNumber(20),
  address: "0.0.3",
  addressChecksum: null,
  name: "Node 0",
  overstaked: false,
};
