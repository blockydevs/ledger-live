import BigNumber from "bignumber.js";
import type { Operation } from "@ledgerhq/types-live";

export const getMockOperation = (overrides?: Partial<Operation>): Operation => {
  return {
    extra: {
      consensusTimestamp: "1.2.3.4",
    },
    id: "",
    hash: "",
    type: "IN",
    value: new BigNumber(0),
    fee: new BigNumber(0),
    senders: [],
    recipients: [],
    blockHeight: undefined,
    blockHash: undefined,
    accountId: "",
    date: new Date(),
    ...overrides,
  };
};
