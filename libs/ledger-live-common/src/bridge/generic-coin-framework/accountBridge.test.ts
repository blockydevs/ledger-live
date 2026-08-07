import type { Account } from "@ledgerhq/types-live";
import type { BridgeApi } from "@ledgerhq/ledger-wallet-framework/api/types";
import { lastValueFrom, toArray } from "rxjs";
import { getCoinFrameworkAccountBridge } from "./accountBridge";
import { getBridgeApi } from "./bridge";
import type { CoinFrameworkSigner } from "./types";

// A matcher that ignores the device address entirely and confirms identity from the public key,
// standing in for any family whose device never computes the account address.
const publicKeyMatcher: NonNullable<BridgeApi["receiveAddressMatcher"]> = (result, account) => ({
  matches: result.publicKey === account.seedIdentifier,
  address: account.freshAddress,
});

jest.mock("./bridge", () => ({ getBridgeApi: jest.fn() }));

const mockedGetBridgeApi = getBridgeApi as jest.MockedFunction<typeof getBridgeApi>;

const baseAccount = {
  freshAddress: "0.0.1234",
  freshAddressPath: "44'/3030'/0'/0'/0'",
  seedIdentifier: "302a300506032b6570032100aabbccddeeff",
  derivationMode: "",
  currency: { id: "some-currency" },
} as unknown as Account;

function makeSigner(getAddressResult: {
  address: string;
  path: string;
  publicKey: string;
}): CoinFrameworkSigner {
  return {
    getAddress: jest.fn().mockResolvedValue(getAddressResult),
    context: jest.fn() as unknown as CoinFrameworkSigner["context"],
  };
}

// The network name passed here is deliberately unrelated to any real family: it must have no
// bearing on which matcher runs, only `bridgeApi.receiveAddressMatcher` does.
const arbitraryNetwork = "not-a-real-family";

describe("getCoinFrameworkAccountBridge receive", () => {
  beforeEach(() => {
    mockedGetBridgeApi.mockReset();
  });

  it("compares by freshAddress when the bridge api sets no receiveAddressMatcher hook", async () => {
    mockedGetBridgeApi.mockResolvedValue({} as BridgeApi);
    const account = {
      ...baseAccount,
      freshAddress: "0xabc",
      currency: { id: "ethereum" },
    } as unknown as Account;
    const signer = makeSigner({
      address: "0xabc",
      path: account.freshAddressPath,
      publicKey: "pub",
    });
    const bridge = await getCoinFrameworkAccountBridge(arbitraryNetwork, "local", signer);

    const events = await lastValueFrom(
      bridge.receive(account, { deviceId: "", verify: true }).pipe(toArray()),
    );

    expect(events.at(-1)).toMatchObject({ address: "0xabc" });
  });

  it("rejects the default comparison when the device address does not match freshAddress, even without a hook", async () => {
    mockedGetBridgeApi.mockResolvedValue({} as BridgeApi);
    const account = {
      ...baseAccount,
      freshAddress: "0xabc",
      currency: { id: "ethereum" },
    } as unknown as Account;
    const signer = makeSigner({
      address: "0xdef",
      path: account.freshAddressPath,
      publicKey: "pub",
    });
    const bridge = await getCoinFrameworkAccountBridge(arbitraryNetwork, "local", signer);

    await expect(
      lastValueFrom(bridge.receive(account, { deviceId: "", verify: true }).pipe(toArray())),
    ).rejects.toThrow("WrongDeviceForAccount");
  });

  it("uses the bridge api's receiveAddressMatcher hook to accept a public-key match, regardless of the network name", async () => {
    mockedGetBridgeApi.mockResolvedValue({ receiveAddressMatcher: publicKeyMatcher } as BridgeApi);
    const signer = makeSigner({
      address: "302a300506032b6570032100aabbccddeeff",
      path: baseAccount.freshAddressPath,
      publicKey: "302a300506032b6570032100aabbccddeeff",
    });
    const bridge = await getCoinFrameworkAccountBridge(arbitraryNetwork, "local", signer);

    const events = await lastValueFrom(
      bridge.receive(baseAccount, { deviceId: "", verify: true }).pipe(toArray()),
    );

    expect(events.at(-1)).toMatchObject({ address: "0.0.1234" });
  });

  it("rejects a public-key mismatch through the hook even when the device address equals freshAddress", async () => {
    mockedGetBridgeApi.mockResolvedValue({ receiveAddressMatcher: publicKeyMatcher } as BridgeApi);
    const signer = makeSigner({
      address: baseAccount.freshAddress,
      path: baseAccount.freshAddressPath,
      publicKey: "302a300506032b6570032100deadbeef",
    });
    const bridge = await getCoinFrameworkAccountBridge(arbitraryNetwork, "local", signer);

    await expect(
      lastValueFrom(bridge.receive(baseAccount, { deviceId: "", verify: true }).pipe(toArray())),
    ).rejects.toThrow("WrongDeviceForAccount");
  });

  it("falls back to the default comparison when the family's bridge api fails to load", async () => {
    mockedGetBridgeApi.mockRejectedValue(new Error("module load failed"));
    const account = {
      ...baseAccount,
      freshAddress: "0xabc",
      currency: { id: "ethereum" },
    } as unknown as Account;
    const signer = makeSigner({
      address: "0xabc",
      path: account.freshAddressPath,
      publicKey: "pub",
    });
    const bridge = await getCoinFrameworkAccountBridge(arbitraryNetwork, "local", signer);

    const events = await lastValueFrom(
      bridge.receive(account, { deviceId: "", verify: true }).pipe(toArray()),
    );

    expect(events.at(-1)).toMatchObject({ address: "0xabc" });
  });
});
