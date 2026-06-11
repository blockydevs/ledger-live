/**
 * Ensures that the address is in the format `0x...`
 * @param addr The address to ensure the format of
 * @returns The address in the format `0x...`
 */
export function ensureAddressFormat(addr: string): `0x${string}` {
  return (addr?.startsWith("0x") ? addr : `0x${addr}`) as `0x${string}`;
}

/**
 * Normalize a Sui address for equality checks against RPC `AddressOwner` values.
 * Ensures `0x` prefix and lowercase hex so account-derived and RPC strings match.
 */
export function normalizeSuiAddressForComparison(addr: string): string {
  return ensureAddressFormat(addr).toLowerCase();
}

/**
 * Normalize a Sui struct tag (coin type *or* event type) to the JSON-RPC short
 * form (e.g. `0x0000…0002::sui::SUI` → `0x2::sui::SUI`,
 * `0x0000…0003::validator::StakingRequestEvent` → `0x3::validator::StakingRequestEvent`).
 *
 * GraphQL emits type tags with addresses in canonical 32-byte long form; JSON-RPC
 * — and so `DEFAULT_COIN_TYPE`, the `STAKING_REQUEST_EVENT`/`UNSTAKING_REQUEST_EVENT`
 * constants, CAL token `contractAddress`es, and every type-string `===` comparison —
 * uses the short form. Normalizing keeps the GraphQL→JSON-RPC adapter output
 * byte-identical to JSON-RPC so downstream equality logic works. Strips leading zeros
 * from each `0x` address segment (covering nested generics) and lowercases the address
 * hex while preserving `module::Name` casing. Deliberately the inverse of
 * `@mysten/sui/utils`' `normalizeStructTag`, which pads addresses to long form.
 */
export function toShortStructTag(structTag: string): string {
  return structTag.replace(/0x0*([0-9a-fA-F]+)/g, (_full, hex: string) => `0x${hex.toLowerCase()}`);
}
