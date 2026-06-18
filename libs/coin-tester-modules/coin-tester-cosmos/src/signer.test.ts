import { DEV_ADDRESS } from "./helpers";
import { buildSigner } from "./signer";

// Hard correctness check: if the signer's derivation drifts (wrong hardening,
// wrong path, wrong HRP encoding, wrong pubkey compression), this fails fast
// — before any docker chain is spun up — and the rest of the test scenario
// can't accidentally proceed signing as the wrong account.
describe("buildSigner", () => {
  it("derives DEV_ADDRESS from DEV_MNEMONIC under the standard Cosmos path", async () => {
    const signer = await buildSigner();
    // Standard Cosmos derivation: m/44'/118'/0'/0/0. The bridge passes the
    // path with `'` stripped — see signOperation.ts:57.
    const result = await signer.getAddressAndPubKey([44, 118, 0, 0, 0], "bbn");
    expect(result.bech32_address).toBe(DEV_ADDRESS);
    expect(result.return_code).toBe(0x9000);
  });
});
