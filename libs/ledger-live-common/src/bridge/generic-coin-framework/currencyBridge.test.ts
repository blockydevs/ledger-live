import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { apiClient } from "@ledgerhq/coin-hedera/network/api";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import BigNumber from "bignumber.js";
import { lastValueFrom, toArray } from "rxjs";
import { getCoinFrameworkCurrencyBridge } from "./currencyBridge";

jest.mock("@ledgerhq/coin-hedera/network/api", () => ({
  apiClient: { getAccountsForPublicKey: jest.fn() },
}));

jest.mock("./getAccountShape", () => ({
  // `used: true` only for hedera, so the fallback-to-default test (run against a family with no
  // buildIterateResult hook) breaks out of scanning after its first empty index instead of
  // walking every derivable index.
  genericGetAccountShape: () => async (info: { address: string; currency: { id: string } }) => ({
    id: `js:2:${info.currency.id}:${info.address}:`,
    used: info.currency.id === "hedera",
    balance: new BigNumber(0),
    spendableBalance: new BigNumber(0),
    operations: [],
    operationsCount: 0,
  }),
}));

const currency = getCryptoCurrencyById("hedera");
const bitcoinCurrency = getCryptoCurrencyById("bitcoin");

const customSigner = {
  getAddress: jest.fn().mockResolvedValue({
    address: "302a300506032b6570032100aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicKey:
      "302a300506032b6570032100aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    path: "44/3030",
  }),
  context: jest.fn(),
} as never;

describe("getCoinFrameworkCurrencyBridge", () => {
  beforeAll(() => {
    // hederaBuildIterateResult reads its config off LiveConfig; outside the app's runtime
    // bootstrap (which loads it from the remote config provider), it stays unset.
    jest.spyOn(LiveConfig, "getValueByKey").mockReturnValue({
      networkType: "mainnet",
      useNetworkTimestamp: true,
      apiUrls: { mirrorNode: "", hgraph: "" },
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves hedera account ids from the mirror node instead of the device public key", async () => {
    jest
      .mocked(apiClient.getAccountsForPublicKey)
      .mockResolvedValue([{ account: "0.0.100" }, { account: "0.0.200" }] as never);

    const currencyBridge = await getCoinFrameworkCurrencyBridge("hedera", "local", customSigner);

    const events = await lastValueFrom(
      currencyBridge
        .scanAccounts({
          currency,
          deviceId: "",
          syncConfig: { paginationConfig: {}, blacklistedTokenIds: [] },
        })
        .pipe(toArray()),
    );

    const discovered = events.filter(e => e.type === "discovered");
    expect(
      discovered.map(e => (e as { account: { freshAddress: string } }).account.freshAddress),
    ).toEqual(["0.0.100", "0.0.200"]);
    // The scan must stop once the mirror node's account list is exhausted,
    // not run through every one of the 255 derivable indexes.
    expect(jest.mocked(apiClient.getAccountsForPublicKey)).toHaveBeenCalledTimes(3);
  });

  it("falls back to the default iterate result builder for a family with no buildIterateResult hook", async () => {
    const currencyBridge = await getCoinFrameworkCurrencyBridge("bitcoin", "local", customSigner);

    const events = await lastValueFrom(
      currencyBridge
        .scanAccounts({
          currency: bitcoinCurrency,
          deviceId: "",
          syncConfig: { paginationConfig: {}, blacklistedTokenIds: [] },
        })
        .pipe(toArray()),
    );

    const discovered = events.filter(e => e.type === "discovered");
    expect(discovered.length).toBeGreaterThan(0);
    discovered.forEach(e => {
      expect((e as { account: { freshAddress: string } }).account.freshAddress).toBe(
        "302a300506032b6570032100aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
    });
    // The mirror-node lookup is hedera-specific; a family without the hook must never reach it.
    expect(apiClient.getAccountsForPublicKey).not.toHaveBeenCalled();
  });
});
