/* eslint-disable @typescript-eslint/consistent-type-assertions */
import type { AssetInfo } from "@ledgerhq/coin-module-framework/api/types";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { TokenCurrency } from "@domain/entity-currency-token";
import type { Account, CryptoAssetsStore } from "@ledgerhq/types-live";
import {
  buildAccountShape,
  computeIntentType,
  describeOptimisticOperation,
  getAssetFromToken,
  getDeviceSignOptions,
  getTokenFromAsset,
} from "./api";

jest.mock("@ledgerhq/ledger-wallet-framework/cryptoAssetsStore");

const mockGetAccountDetails = jest.fn();
const mockGetAccountDelegations = jest.fn();
jest.mock("@ledgerhq/coin-multiversx/network/api", () => ({
  createNetworkApi: () => ({
    getAccountDetails: mockGetAccountDetails,
    getAccountDelegations: mockGetAccountDelegations,
  }),
}));
jest.mock("../../../bridge/generic-coin-framework/api/context", () => ({
  buildContext: () => ({
    config: async () => ({
      apiEndpoint: "https://api",
      delegationApiEndpoint: "https://delegations",
    }),
  }),
}));

const mockToken = {
  id: "elrond/esdt/555344432d633736663166",
  tokenType: "esdt",
  contractAddress: "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u",
  tokenIdentifier: "USDC-c76f1f",
  name: "WrappedUSDC",
  units: [{ name: "WrappedUSDC", code: "USDC", magnitude: 6 }],
} as unknown as TokenCurrency;

const multiversx = getCryptoCurrencyById("elrond");

describe("multiversx bridge", () => {
  describe("computeIntentType", () => {
    it.each([
      [{ mode: "send" }, "send"],
      [{}, "send"],
      [{ mode: undefined }, "send"],
      [{ mode: "delegate" }, "delegate"],
      [{ mode: "unDelegate" }, "unDelegate"],
      [{ mode: "claimRewards" }, "claimRewards"],
      [{ mode: "withdraw" }, "withdraw"],
      [{ mode: "reDelegateRewards" }, "reDelegateRewards"],
      [{ mode: "undelegate" }, "unDelegate"],
      [{ mode: "claimReward" }, "claimRewards"],
      [{ mode: "compoundReward" }, "reDelegateRewards"],
    ])("maps %o to %s", (transaction, expected) => {
      expect(computeIntentType(transaction)).toBe(expected);
    });

    it("throws for an unsupported mode", () => {
      expect(() => computeIntentType({ mode: "swap" })).toThrow(
        "Unsupported MultiversX transaction mode: swap",
      );
    });
  });

  describe("buildAccountShape", () => {
    it("keeps every delegation with its own unbonding entries, and the guardian flag", async () => {
      const delegations = [
        {
          contract: "erd1contract1",
          userActiveStake: "2000000000000000000",
          claimableRewards: "1000",
          userUndelegatedList: [
            { amount: "1000000000000000000", seconds: 3600 },
            { amount: "500000000000000000", seconds: 7200 },
          ],
        },
        {
          contract: "erd1contract2",
          userActiveStake: "1000000000000000000",
          userUndelegatedList: [],
        },
      ];
      mockGetAccountDetails.mockResolvedValue({ balance: "1", nonce: 42, isGuarded: true });
      mockGetAccountDelegations.mockResolvedValue(delegations);

      await expect(buildAccountShape("erd1address")).resolves.toEqual({
        multiversxResources: { nonce: 42, delegations, isGuarded: true },
      });
    });

    it("yields an empty delegation list for an account that does not stake", async () => {
      mockGetAccountDetails.mockResolvedValue({ balance: "1", nonce: 0, isGuarded: false });
      mockGetAccountDelegations.mockResolvedValue([]);

      await expect(buildAccountShape("erd1address")).resolves.toEqual({
        multiversxResources: { nonce: 0, delegations: [], isGuarded: false },
      });
    });
  });

  describe("describeOptimisticOperation", () => {
    it.each([
      ["unDelegate", "UNDELEGATE"],
      ["claimRewards", "REWARD"],
      ["reDelegateRewards", "DELEGATE"],
      ["compoundReward", "DELEGATE"],
    ])("files %s under %s, as the synced history does", (mode, type) => {
      expect(describeOptimisticOperation(mode)).toEqual({ type });
    });

    it.each(["send", "delegate", "undelegate", "claimReward", "withdraw"])(
      "keeps the generic type for %s",
      mode => {
        expect(describeOptimisticOperation(mode)).toBeUndefined();
      },
    );
  });

  describe("getDeviceSignOptions", () => {
    const tokenAccount = {
      id: "token-account",
      type: "TokenAccount",
      token: {
        ...mockToken,
        ticker: "USDC",
        ledgerSignature: "3045022100abcdef",
      },
    };
    const account = { id: "egld-account", subAccounts: [tokenAccount] } as unknown as Account;

    it("hands the ESDT metadata to the signer for a token transfer", () => {
      expect(getDeviceSignOptions({ subAccountId: "token-account" }, account)).toEqual({
        esdt: {
          ticker: "USDC",
          identifier: "555344432d633736663166",
          decimals: 6,
          chainId: "1",
          ledgerSignature: "3045022100abcdef",
        },
      });
    });

    it("hands nothing over for a native transfer", () => {
      expect(getDeviceSignOptions({ subAccountId: null }, account)).toBeUndefined();
    });
  });

  describe("getTokenFromAsset", () => {
    const mockFindTokenByAddressInCurrency = jest.fn() as jest.MockedFunction<
      CryptoAssetsStore["findTokenByAddressInCurrency"]
    >;

    (
      jest.requireMock("@ledgerhq/ledger-wallet-framework/cryptoAssetsStore") as {
        getCryptoAssetsStore: jest.Mock;
      }
    ).getCryptoAssetsStore.mockReturnValue({
      findTokenByAddressInCurrency: mockFindTokenByAddressInCurrency,
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it("returns undefined when asset type is native", async () => {
      const asset: AssetInfo = { type: "native" };

      const result = await getTokenFromAsset(multiversx, asset);

      expect(result).toBeUndefined();
      expect(mockFindTokenByAddressInCurrency).not.toHaveBeenCalled();
    });

    it("returns undefined when asset has no assetReference", async () => {
      const asset = { type: "esdt" } as AssetInfo;

      const result = await getTokenFromAsset(multiversx, asset);

      expect(result).toBeUndefined();
      expect(mockFindTokenByAddressInCurrency).not.toHaveBeenCalled();
    });

    it("calls findTokenByAddressInCurrency with ESDT SC + identifier", async () => {
      mockFindTokenByAddressInCurrency.mockResolvedValue(mockToken);
      const asset: AssetInfo = {
        type: "esdt",
        assetReference: "USDC-c76f1f",
        assetOwner: "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u",
      };

      const result = await getTokenFromAsset(multiversx, asset);

      expect(mockFindTokenByAddressInCurrency).toHaveBeenCalledWith(
        "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u",
        multiversx.id,
        "USDC-c76f1f",
      );
      expect(result).toBe(mockToken);
    });

    it("returns undefined when token is not found", async () => {
      mockFindTokenByAddressInCurrency.mockResolvedValue(undefined);
      const asset: AssetInfo = {
        type: "esdt",
        assetReference: "UNKNOWN-000000",
        assetOwner: "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u",
      };

      const result = await getTokenFromAsset(multiversx, asset);

      expect(result).toBeUndefined();
    });
  });

  describe("getAssetFromToken", () => {
    it("returns correct AssetInfo with all fields mapped properly", () => {
      const result = getAssetFromToken(mockToken);

      expect(result).toEqual({
        type: "esdt",
        assetReference: "USDC-c76f1f",
        assetOwner: "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u",
      });
    });

    it("uses token.tokenType for type", () => {
      const result = getAssetFromToken(mockToken);

      expect(result?.type).toBe(mockToken.tokenType);
    });

    it("uses ESDT system SC as assetOwner", () => {
      const result = getAssetFromToken(mockToken);

      expect(result).toHaveProperty(
        "assetOwner",
        "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u",
      );
    });

    it("returns undefined when tokenIdentifier is missing", () => {
      const token = { ...mockToken, tokenIdentifier: undefined } as unknown as TokenCurrency;

      expect(getAssetFromToken(token)).toBeUndefined();
    });
  });
});
