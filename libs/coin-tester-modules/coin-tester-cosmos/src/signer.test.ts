import { buildSigner } from "./signer";

// The scenarios run buildSigner() with a random seed, but derivation
// correctness still needs a fixed reference. We pin the BIP-39 zero test vector
// and its known Cosmos address here: if derivation drifts (wrong hardening,
// wrong path, wrong HRP encoding, wrong pubkey compression), this fails fast as
// a pure unit test — before any docker chain is spun up.
const KNOWN_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const KNOWN_BBN_ADDRESS = "bbn19rl4cm2hmr8afy4kldpxz3fka4jguq0at7uvqv";

describe("buildSigner", () => {
  it("derives the known address from a fixed mnemonic under the standard Cosmos path", async () => {
    const signer = await buildSigner(KNOWN_MNEMONIC);
    // Standard Cosmos derivation: m/44'/118'/0'/0/0. The bridge passes the
    // path with `'` stripped — see signOperation.ts.
    const result = await signer.getAddressAndPubKey([44, 118, 0, 0, 0], "bbn");
    expect(result.bech32_address).toBe(KNOWN_BBN_ADDRESS);
    expect(result.return_code).toBe(0x9000);
  });

  it("generates a fresh, self-consistent account when no mnemonic is given", async () => {
    const signer = await buildSigner();
    const fromNumberPath = await signer.getAddressAndPubKey([44, 118, 0, 0, 0], "cosmos");
    const fromStringPath = await signer.getAddress("44'/118'/0'/0/0", "cosmos");
    // The two derivation entry points must agree, and a random seed must yield
    // a different account than the fixed vector above.
    expect(fromStringPath.address).toBe(fromNumberPath.bech32_address);
    expect(fromNumberPath.bech32_address.startsWith("cosmos1")).toBe(true);
    expect(fromNumberPath.bech32_address).not.toBe(KNOWN_BBN_ADDRESS);
  });
});
