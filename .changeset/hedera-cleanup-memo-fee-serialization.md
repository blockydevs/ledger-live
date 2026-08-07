---
"@ledgerhq/coin-hedera": patch
"@ledgerhq/live-common": patch
---

Align the Hedera memo defaults, fix the claim-rewards fee type, and move transaction serialization to the family.

Three craft paths passed `undefined` where the others passed `""`; the protobuf encoder writes a two-byte empty field for `""` and omits it for `undefined`, so the signed bytes differed between them. Claim-rewards estimated its fee as `CryptoUpdate` while the signed transaction is a `CryptoTransfer`, inflating the figure shown in `errors.fee` and `warnings.claimRewardsFee` by a fixed 2.2x. Transaction serialization now runs against `GenericTransaction` in the family, replacing the package-local module that handled the dead shape.
