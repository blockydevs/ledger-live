import { AccountLike } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import getDeviceTransactionConfig from "./deviceTransactionConfig";
import { ASA_TOKEN, ASSET_ID } from "./test/fixtures";

jest.mock("@ledgerhq/ledger-wallet-framework/cryptoAssetsStore", () => ({
  getCryptoAssetsStore: jest.fn(),
}));

describe("getDeviceTransactionConfig", () => {
  const mockAccount: AccountLike = {
    type: "Account",
    currency: {
      units: [{ code: "ALGO", magnitude: 6 }],
    },
  } as any;

  it("should return fields for send transaction", async () => {
    const result = await getDeviceTransactionConfig({
      account: mockAccount,
      transaction: {
        mode: "send",
        recipient: "test-address",
      } as any,
      status: {
        amount: new BigNumber(1000000),
        estimatedFees: new BigNumber(1000),
      } as any,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual({ type: "text", label: "Type", value: "Payment" });
  });

  describe("optIn", () => {
    const findTokenById = jest.fn();
    const status = { amount: new BigNumber(0), estimatedFees: new BigNumber(1000) } as any;

    beforeEach(() => {
      findTokenById.mockReset().mockResolvedValue(ASA_TOKEN);
      jest.mocked(getCryptoAssetsStore).mockReturnValue({ findTokenById } as any);
    });

    it.each([
      ["the legacy asset id", { assetId: ASA_TOKEN.id }],
      ["the generic asset reference", { assetReference: ASSET_ID }],
    ])("shows the Asset ID read from %s", async (_, assetFields) => {
      const result = await getDeviceTransactionConfig({
        account: mockAccount,
        transaction: { mode: "optIn", recipient: "test-address", ...assetFields } as any,
        status,
      });

      expect(findTokenById).toHaveBeenCalledTimes(1);
      expect(findTokenById).toHaveBeenCalledWith(ASA_TOKEN.id);
      expect(result).toContainEqual({
        type: "text",
        label: "Asset ID",
        value: `${ASA_TOKEN.name} (#${ASSET_ID})`,
      });
    });
  });
});
