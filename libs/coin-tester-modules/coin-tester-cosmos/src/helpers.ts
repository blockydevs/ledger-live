import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets/currencies";

export const babylon = getCryptoCurrencyById("babylon");

// Mirrored verbatim in coin-tester-babylond/entrypoint.sh — when changing one,
// change both. BIP-39 zero test vector; the chain pre-funds the address derived
// from it (DEV_ADDRESS below) with 1,000,000 BABY at genesis.
export const DEV_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// Hard correctness target. If buildSigner() doesn't produce this from
// DEV_MNEMONIC under the standard Cosmos derivation path, every test signs
// as the wrong account and fails at the first balance assertion.
export const DEV_ADDRESS = "bbn19rl4cm2hmr8afy4kldpxz3fka4jguq0at7uvqv";
