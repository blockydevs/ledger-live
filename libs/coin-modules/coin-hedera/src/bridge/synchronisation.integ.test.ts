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

describe("getAccountShape [network]", () => {
  // One sync per account, shared across scenarios: each sync hits three live services
  // (mirror node, hgraph, CAL) with fetchAllPages, and sharing the result also means the
  // balance cannot move between assertions about the same account.
  let withTokensShape: Partial<HederaAccount>;
  let withoutTokensShape: Partial<HederaAccount>;

  beforeAll(async () => {
    hederaCoinConfig.setCoinConfig(() => getMockedConfig());
    // real CAL API client: getAccountShape resolves tokens through it, so without it
    // subAccounts would come back empty
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
      expect(withoutTokensShape.syncHash).toEqual(expect.any(String));
    });

    it("returns a spendable balance equal to the account balance", () => {
      // moving target: structural assertions only
      expect(withoutTokensShape.balance).toBeInstanceOf(BigNumber);
      expect(withoutTokensShape.balance!.isGreaterThanOrEqualTo(0)).toBe(true);
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
      // token associations are immutable once created -> exact assertions
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
        // amounts move: structural only
        expect(subAccount.balance).toBeInstanceOf(BigNumber);
      }
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
      // NONE operations are excluded on purpose: makeCoinOperationForOrphanChildOperation
      // leaves their accountId empty even though it derives the correct one to build their
      // id. Asserting over them would freeze that inconsistency into a test.
      expect(
        withTokensShape
          .operations!.filter(op => op.type !== "NONE")
          .every(op => op.accountId === withTokensShape.id),
      ).toBe(true);
    });
  });

  describe("delegation", () => {
    it("reports the delegation of a staking account", () => {
      const delegation = withTokensShape.hederaResources!.delegation;

      expect(delegation).not.toBeNull();
      // nodeId is 0 for this account, so any "> 0" assertion would be wrong
      expect(delegation!.nodeId).toEqual(expect.any(Number));
      expect(delegation!.delegated).toBeInstanceOf(BigNumber);
      expect(delegation!.pendingReward).toBeInstanceOf(BigNumber);
      expect(delegation!.delegated).toEqual(withTokensShape.balance);
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

      // The shape carries syncHash, so the second pass syncs incrementally rather than
      // from scratch. Its cursor is floored to a whole second while the latest operation
      // has non-zero nanoseconds, and the pagination direction is "gt" -- so the latest
      // operation is fetched again and mergeOps has to deduplicate it. This assertion is
      // therefore not vacuous.
      const ids = second.operations!.map(op => op.id);

      expect(second.syncHash).toBe(first.syncHash);
      expect(new Set(ids).size).toBe(ids.length);
      expect(second.operations!.length).toBeGreaterThanOrEqual(first.operations!.length);
    });
  });

  describe("buildIterateResult", () => {
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

      // an account id is immutable once created -> exact assertion. The path comes from
      // runDerivationScheme (hedera's own scheme), not the caller-supplied derivationScheme.
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

  describe("pristine account", () => {
    it("returns an empty shape for an account that never transacted", async () => {
      const shape = await getAccountShape(
        buildInfo(MAINNET_TEST_ACCOUNTS.pristine.accountId),
        syncConfig,
      );

      // never transacted -> frozen in practice -> exact assertions
      expect(shape.operations).toEqual([]);
      expect(shape.operationsCount).toBe(0);
      expect(shape.subAccounts).toEqual([]);
      expect(shape.balance).toEqual(new BigNumber(0));
      expect(shape.hederaResources!.delegation).toBeNull();
    });
  });
});
