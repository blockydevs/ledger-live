import type { MultiversXAccount, MultiversXResources } from "@ledgerhq/coin-multiversx/types";
import type { Account, AccountRaw } from "@ledgerhq/types-live";
import accountRawAssign from "./accountRawAssign";

// Two delegations, each with its own unbonding entries: the staking section renders every entry
// with its own countdown, so the list must come back as it was stored, not as one total.
const resources: MultiversXResources = {
  nonce: 42,
  isGuarded: true,
  delegations: [
    {
      address: "erd1user",
      contract: "erd1providera",
      userUnBondable: "0",
      userActiveStake: "2000000000000000000",
      claimableRewards: "1500000000000000",
      userUndelegatedList: [
        { amount: "1000000000000000000", seconds: 86_400 },
        { amount: "500000000000000000", seconds: 0 },
      ],
    },
    {
      address: "erd1user",
      contract: "erd1providerb",
      userUnBondable: "1000000000000000000",
      userActiveStake: "0",
      claimableRewards: "0",
      userUndelegatedList: [],
    },
  ],
};

describe("multiversx accountRawAssign", () => {
  it("brings multiversxResources back unchanged from a stored raw account", () => {
    const raw = {} as AccountRaw;
    accountRawAssign.assignToAccountRaw(
      { multiversxResources: resources } as unknown as Account,
      raw,
    );

    const restored = {} as MultiversXAccount;
    accountRawAssign.assignFromAccountRaw(JSON.parse(JSON.stringify(raw)), restored);

    expect(restored.multiversxResources).toEqual(resources);
  });
});
