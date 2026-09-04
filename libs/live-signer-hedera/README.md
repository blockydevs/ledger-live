<img src="https://user-images.githubusercontent.com/4631227/191834116-59cf590e-25cc-4956-ae5c-812ea464f324.png" height="100" />

[GitHub](https://github.com/LedgerHQ/ledger-live/),
[Ledger Devs Discord](https://developers.ledger.com/discord-pro),
[Developer Portal](https://developers.ledger.com/)

## @ledgerhq/live-signer-hedera

> [!NOTE]
> **Status: STABLE** — Production-ready; API is considered stable.

Ledger Hardware Wallet Hedera JavaScript bindings via DMK.

The Hedera device app takes a 4-byte little-endian key index, not a BIP32 path.
`DmkSignerHedera` pins that index to 0 by passing the constant `44'/3030'` to the
signer kit, and ignores the path its caller gives it. Ledger Live's `hederaBip44`
derivation mode produces the same path for every account index, so a pinned index
keeps the wire bytes identical for every stored account.

## Running the Speculos suite

Run this against a local Speculos before raising the `ldmkHederaSigner` flag
percentage.

1. Start Speculos with the Hedera app loaded.
2. Set `SEED` to the emulator's 24-word seed.
3. Set `SPECULOS_API_PORT` if the emulator does not run on port 5000.
4. Run `pnpm --filter @ledgerhq/live-signer-hedera test:integ`.

The signing case shows the transfer on the device and drives the approval
buttons itself through the emulator's HTTP button API. This suite is excluded
from the default `pnpm test` run by `testPathIgnorePatterns` in
`jest.config.js` and only picked up by `jest.integ.config.js`.
