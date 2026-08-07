import type { Account, AccountRaw } from "@ledgerhq/types-live";
import type { HederaAccount, HederaAccountRaw } from "@ledgerhq/coin-hedera/types";
import { assignFromAccountRaw, assignToAccountRaw } from "./serialization";

const STAKE = {
  uid: "0.0.1001",
  address: "0.0.1001",
  asset: { type: "native" as const },
  state: "active" as const,
  amount: 1_000n,
  amountDeposited: 900n,
  amountRewarded: 100n,
  actions: [],
  details: { stakedNodeId: 5, overstaked: false },
};

describe("hedera serialization — stakingPositions", () => {
  it("round-trips a delegation through raw and back", () => {
    const account = { stakingPositions: [STAKE] } as unknown as HederaAccount;
    const accountRaw = {} as AccountRaw;

    assignToAccountRaw(account as Account, accountRaw);
    expect((accountRaw as HederaAccountRaw).stakingPositions).toEqual([
      { ...STAKE, amount: "1000", amountDeposited: "900", amountRewarded: "100" },
    ]);

    const restored = {} as HederaAccount;
    assignFromAccountRaw(accountRaw, restored as Account);
    expect(restored.stakingPositions).toEqual([STAKE]);
  });

  it("restores an empty array when there is no delegation", () => {
    const restored = {} as HederaAccount;
    assignFromAccountRaw({} as AccountRaw, restored as Account);
    expect(restored.stakingPositions).toEqual([]);
  });
});

describe("hedera serialization — hederaResources", () => {
  it("round-trips auto token association state through raw and back", () => {
    const account = {
      hederaResources: {
        maxAutomaticTokenAssociations: -1,
        isAutoTokenAssociationEnabled: true,
        delegation: null,
      },
    } as unknown as HederaAccount;
    const accountRaw = {} as AccountRaw;

    assignToAccountRaw(account as Account, accountRaw);
    expect((accountRaw as HederaAccountRaw).hederaResources).toEqual({
      maxAutomaticTokenAssociations: -1,
      isAutoTokenAssociationEnabled: true,
      delegation: null,
    });

    const restored = {} as HederaAccount;
    assignFromAccountRaw(accountRaw, restored as Account);
    expect(restored.hederaResources).toEqual(account.hederaResources);
  });

  it("leaves hederaResources untouched when absent", () => {
    const account = {} as HederaAccount;
    const accountRaw = {} as AccountRaw;

    assignToAccountRaw(account as Account, accountRaw);
    expect((accountRaw as HederaAccountRaw).hederaResources).toBeUndefined();

    const restored = {} as HederaAccount;
    assignFromAccountRaw(accountRaw, restored as Account);
    expect(restored.hederaResources).toBeUndefined();
  });
});
