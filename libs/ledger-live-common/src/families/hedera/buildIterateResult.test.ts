import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { apiClient } from "@ledgerhq/coin-hedera/network/api";
import { getCryptoCurrencyById } from "../../currencies";
import { hederaBuildIterateResult } from "./buildIterateResult";

const DEVICE_PUBLIC_KEY = "302a300506032b6570032100" + "ab".repeat(32);

describe("hederaBuildIterateResult", () => {
  const currency = getCryptoCurrencyById("hedera");

  beforeEach(() => {
    jest.spyOn(LiveConfig, "getValueByKey").mockReturnValue({
      networkType: "mainnet",
      useNetworkTimestamp: true,
      apiUrls: { mirrorNode: "", hgraph: "" },
    });
    jest
      .spyOn(apiClient, "getAccountsForPublicKey")
      .mockResolvedValue([{ account: "0.0.111" }, { account: "0.0.222" }] as Awaited<
        ReturnType<typeof apiClient.getAccountsForPublicKey>
      >);
  });

  afterEach(() => jest.restoreAllMocks());

  const iterate = async (index: number) => {
    const iterateResult = await hederaBuildIterateResult({
      result: { address: DEVICE_PUBLIC_KEY, publicKey: DEVICE_PUBLIC_KEY, path: "44'/3030'/0'/0/0" },
      derivationMode: "",
      derivationScheme: "44'/3030'/<account>'/0/0",
    });

    return iterateResult({
      index,
      derivationsCache: {},
      derivationMode: "",
      derivationScheme: "44'/3030'/<account>'/0/0",
      currency,
      deviceId: "",
    });
  };

  it("reports the mirror node account id as the address and the device key as the public key", async () => {
    await expect(iterate(0)).resolves.toMatchObject({
      address: "0.0.111",
      publicKey: DEVICE_PUBLIC_KEY,
    });
    await expect(iterate(1)).resolves.toMatchObject({
      address: "0.0.222",
      publicKey: DEVICE_PUBLIC_KEY,
    });
  });

  it("stops the scan once the mirror node has no further account id", async () => {
    await expect(iterate(2)).resolves.toBeNull();
  });
});
