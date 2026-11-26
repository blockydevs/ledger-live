import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import { ASA_ID, asaToken } from "../__mocks__/asa.mock";
import {
  computeIntentType,
  describeOptimisticOperation,
  getAssetFromToken,
  getTokenFromAsset,
} from "./api";

jest.mock("@ledgerhq/ledger-wallet-framework/cryptoAssetsStore", () => ({
  getCryptoAssetsStore: jest.fn(),
}));

const OWNER = "OWNER_ADDRESS";

describe("Algorand bridge api", () => {
  const findTokenById = jest.fn();

  beforeEach(() => {
    findTokenById
      .mockReset()
      .mockImplementation(async (id: string) => (id === asaToken.id ? asaToken : undefined));
    jest.mocked(getCryptoAssetsStore).mockReturnValue({
      findTokenById,
    } as unknown as ReturnType<typeof getCryptoAssetsStore>);
  });

  it("maps an ASA token to its asset id, owned by the holder, and back", async () => {
    const asset = getAssetFromToken(asaToken, OWNER);

    expect(asset).toEqual({ type: "asa", assetReference: ASA_ID, assetOwner: OWNER });
    await expect(getTokenFromAsset(asset)).resolves.toBe(asaToken);
  });

  it("finds the token of an asset typed with the generic token type", async () => {
    const asset = { type: "token", assetReference: ASA_ID, assetOwner: OWNER };

    await expect(getTokenFromAsset(asset)).resolves.toBe(asaToken);
  });

  it("does not look for a token for the native asset", async () => {
    await expect(getTokenFromAsset({ type: "native" })).resolves.toBeUndefined();
    expect(findTokenById).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["send", "send"],
    [undefined, "send"],
    ["optIn", "optIn"],
  ])("maps the %s mode to the %s intent type", (mode, intentType) => {
    expect(computeIntentType({ mode })).toBe(intentType);
  });

  it("rejects an unsupported mode", () => {
    expect(() => computeIntentType({ mode: "unsupported" })).toThrow(
      "Unsupported Algorand transaction mode: unsupported",
    );
  });

  it("types the pending operation of an opt-in as OPT_IN", () => {
    expect(describeOptimisticOperation("optIn")).toEqual({ type: "OPT_IN" });
    expect(describeOptimisticOperation("send")).toBeUndefined();
  });
});
