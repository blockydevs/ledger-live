import BigNumber from "bignumber.js";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import type { HederaAccount } from "@ledgerhq/coin-hedera/types/index";
import { getCryptoCurrencyById } from "../../currencies";
import { getHederaDelegation } from "./delegation";

describe("getHederaDelegation", () => {
  const buildAccount = (stakingPositions?: unknown[]): HederaAccount =>
    ({
      ...genAccount("hedera-1", { currency: getCryptoCurrencyById("hedera") }),
      stakingPositions,
    }) as unknown as HederaAccount;

  it("returns undefined when the account holds no staking position", () => {
    expect(getHederaDelegation(buildAccount(undefined))).toBeUndefined();
    expect(getHederaDelegation(buildAccount([]))).toBeUndefined();
  });

  it("returns undefined when stakedNodeId is the mirror node's unstaked sentinel", () => {
    const account = buildAccount([
      {
        amountDeposited: 100n,
        amountRewarded: 5n,
        details: { stakedNodeId: -1, overstaked: null },
      },
    ]);

    expect(getHederaDelegation(account)).toBeUndefined();
  });

  it("returns the delegation when stakedNodeId is a real node", () => {
    const account = buildAccount([
      {
        amountDeposited: 100n,
        amountRewarded: 5n,
        details: { stakedNodeId: 3, overstaked: false },
      },
    ]);

    expect(getHederaDelegation(account)).toEqual({
      nodeId: 3,
      delegated: new BigNumber(100),
      pendingReward: new BigNumber(5),
    });
  });
});
