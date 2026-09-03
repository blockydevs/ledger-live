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

## Vendored signer kit

`@ledgerhq/device-signer-kit-hedera@0.1.0` is not published to the registry. The
package is consumed as a packed tarball committed at
`vendor/device-signer-kit-hedera-0.1.0.tgz`, wired up by a `pnpm.overrides` entry
in the root `package.json` because the pnpm catalog rejects a `file:` specifier.

Once the kit ships to the registry, revert this commit and run `pnpm install`.
The package manifest already declares the literal version `0.1.0`, so removing
the override before the kit is published makes the install fail loudly instead
of resolving to something wrong.
