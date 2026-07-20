import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { setupCalClientStore } from "@ledgerhq/cryptoassets/cal-client/test-helpers";
import type { AccountShapeInfo } from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import BigNumber from "bignumber.js";
import hederaCoinConfig from "../config";
import { HARDCODED_BLOCK_HEIGHT } from "../constants";
import { MAINNET_TEST_ACCOUNTS } from "../test/fixtures/account.fixture";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import type { HederaAccount } from "../types";
import { buildIterateResult, getAccountShape } from "./synchronisation";

const currency = getCryptoCurrencyById("hedera");
const syncConfig = { paginationConfig: {}, blacklistedTokenIds: [] };

const buildInfo = (address: string): AccountShapeInfo<HederaAccount> => ({
  currency,
  derivationMode: "" as const,
  address,
  initialAccount: undefined,
  index: 0,
  derivationPath: "44/3030",
});

describe("getAccountShape", () => {
  // one sync per account, reused so the balance can't move between assertions about it
  let withTokensShape: Partial<HederaAccount>;
  let withoutTokensShape: Partial<HederaAccount>;

  beforeAll(async () => {
    hederaCoinConfig.setCoinConfig(() => getMockedConfig());
    setupCalClientStore();

    [withTokensShape, withoutTokensShape] = await Promise.all([
      getAccountShape(buildInfo(MAINNET_TEST_ACCOUNTS.withTokens.accountId), syncConfig),
      getAccountShape(buildInfo(MAINNET_TEST_ACCOUNTS.withoutTokens.accountId), syncConfig),
    ]);
  });

  describe("account without tokens", () => {
    it("returns a coherent account shape", () => {
      expect(withoutTokensShape.id).toBe(
        `js:2:hedera:${MAINNET_TEST_ACCOUNTS.withoutTokens.accountId}:`,
      );
      expect(withoutTokensShape.freshAddress).toBe(MAINNET_TEST_ACCOUNTS.withoutTokens.accountId);
      expect(withoutTokensShape.subAccounts).toEqual([]);
      // hedera has no blocks; the shape pins a constant so operations count as confirmed
      expect(withoutTokensShape.blockHeight).toBe(HARDCODED_BLOCK_HEIGHT);
      // getSyncHash (ledger-wallet-framework) hex-encodes an imurmurhash 32-bit result
      expect(withoutTokensShape.syncHash).toMatch(/^0x[0-9a-f]{1,8}$/);
    });

    it("returns a spendable balance equal to the account balance", () => {
      // never stakes (staked_node_id null), so the balance is fixed and can be pinned exactly
      expect(withoutTokensShape.balance).toEqual(new BigNumber(1_000_000));
      expect(withoutTokensShape.spendableBalance).toEqual(withoutTokensShape.balance);
    });

    it("reports hedera resources with auto association disabled", () => {
      expect(withoutTokensShape.hederaResources).toMatchObject({
        maxAutomaticTokenAssociations: 0,
        isAutoTokenAssociationEnabled: false,
      });
    });
  });

  describe("account with HTS and ERC20 tokens", () => {
    it("composes CAL, mirror node and hgraph into sub accounts", () => {
      const contractAddresses = withTokensShape.subAccounts!.map(sa => sa.token.contractAddress);

      expect(withTokensShape.subAccounts!.length).toBeGreaterThan(0);
      // token associations are immutable once created, so these can be exact
      expect(contractAddresses).toContain(
        MAINNET_TEST_ACCOUNTS.withTokens.associatedTokenWithBalance,
      );
      expect(contractAddresses).toContain(MAINNET_TEST_ACCOUNTS.withTokens.erc20Token);
    });

    it("resolves every sub account through CAL and scopes it to the parent account", () => {
      for (const subAccount of withTokensShape.subAccounts!) {
        expect(subAccount.parentId).toBe(withTokensShape.id);
        expect(subAccount.token.parentCurrencyId).toBe("hedera");
        expect(["hts", "erc20"]).toContain(subAccount.token.tokenType);
        expect(subAccount.balance).toBeInstanceOf(BigNumber);
      }
    });

    it("returns a spendable balance equal to the account balance", () => {
      // account stakes, balance moves with every reward payout — can't pin exact value
      expect(withTokensShape.balance!.isGreaterThan(0)).toBe(true);
      expect(withTokensShape.spendableBalance).toEqual(withTokensShape.balance);
    });

    it("enables auto token association", () => {
      expect(withTokensShape.hederaResources).toMatchObject({
        maxAutomaticTokenAssociations: -1,
        isAutoTokenAssociationEnabled: true,
      });
    });

    it("returns operations that are unique and scoped to the account", () => {
      const ids = withTokensShape.operations!.map(op => op.id);

      expect(withTokensShape.operations!.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect(withTokensShape.operationsCount).toBe(withTokensShape.operations!.length);
      // NONE ops have an empty accountId by design, so they're excluded from this check
      expect(
        withTokensShape
          .operations!.filter(op => op.type !== "NONE")
          .every(op => op.accountId === withTokensShape.id),
      ).toBe(true);
    });
  });

  describe("delegation", () => {
    it("reports the delegation of a staking account", () => {
      // nodeId is 0 for this account, so any "> 0" assertion would be wrong
      expect(withTokensShape.hederaResources!.delegation).toEqual({
        nodeId: expect.any(Number),
        delegated: withTokensShape.balance,
        pendingReward: expect.any(BigNumber),
      });
    });

    it("reports no delegation for a non staking account", () => {
      expect(withoutTokensShape.hederaResources!.delegation).toBeNull();
    });
  });

  describe("incremental sync", () => {
    it("merges a second sync without duplicating operations", async () => {
      const info = buildInfo(MAINNET_TEST_ACCOUNTS.withTokens.accountId);
      const first = await getAccountShape(info, syncConfig);
      const second = await getAccountShape(
        { ...info, initialAccount: first as HederaAccount },
        syncConfig,
      );

      // the incremental cursor is floored to a whole second, so the latest op is refetched
      // and mergeOps has to deduplicate it
      const ids = second.operations!.map(op => op.id);

      expect(second.syncHash).toBe(first.syncHash);
      expect(new Set(ids).size).toBe(ids.length);
      expect(second.operations!.length).toBeGreaterThanOrEqual(first.operations!.length);
    });
  });

  it("returns an empty shape for a pristine account that never transacted", async () => {
    const shape = await getAccountShape(
      buildInfo(MAINNET_TEST_ACCOUNTS.pristine.accountId),
      syncConfig,
    );

    expect(shape.operations).toEqual([]);
    expect(shape.operationsCount).toBe(0);
    expect(shape.subAccounts).toEqual([]);
    expect(shape.balance).toEqual(new BigNumber(0));
    expect(shape.hederaResources!.delegation).toBeNull();
  });
});

describe("buildIterateResult", () => {
  beforeAll(() => {
    hederaCoinConfig.setCoinConfig(() => getMockedConfig());
  });

  it("resolves the account owned by a public key", async () => {
    const iterate = await buildIterateResult({
      result: {
        publicKey: MAINNET_TEST_ACCOUNTS.withTokens.publicKey,
        address: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        path: "44/3030",
      },
      derivationMode: "" as const,
      derivationScheme: "44'/3030'/<account>'/0/0",
    });

    const result = await iterate({
      currency,
      derivationMode: "" as const,
      index: 0,
      derivationsCache: {},
      derivationScheme: "44'/3030'/<account>'/0/0",
      deviceId: "",
    });

    // path comes from hedera's own derivation scheme, not the caller-supplied one
    expect(result).toMatchObject({
      address: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
      path: "44'/3030'/0'/0/0",
    });
  });

  it("returns null when the public key owns no account at that index", async () => {
    const iterate = await buildIterateResult({
      result: {
        publicKey: MAINNET_TEST_ACCOUNTS.withTokens.publicKey,
        address: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        path: "44/3030",
      },
      derivationMode: "" as const,
      derivationScheme: "44'/3030'/<account>'/0/0",
    });

    const result = await iterate({
      currency,
      derivationMode: "" as const,
      index: 999,
      derivationsCache: {},
      derivationScheme: "44'/3030'/<account>'/0/0",
      deviceId: "",
    });

    expect(result).toBeNull();
  });
});
