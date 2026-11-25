import { GAS_PER_DATA_BYTE, GAS_PRICE, GAS_PRICE_MODIFIER, MIN_GAS_LIMIT } from "../../constants";

const MODIFIED_GAS_PRICE = BigInt(Math.round(GAS_PRICE * GAS_PRICE_MODIFIER));

/** The base cost plus a charge per byte of `data`: the least gas a transaction can carry. */
export function getMoveBalanceGas(data: string | undefined): bigint {
  const dataLength = data ? BigInt(Buffer.from(data, "base64").length) : 0n;
  return BigInt(MIN_GAS_LIMIT) + dataLength * BigInt(GAS_PER_DATA_BYTE);
}

/**
 * The MultiversX SDK's `computeFee`, which the legacy bridge uses (`network/sdk.ts:getFees`): the
 * move-balance gas at the full gas price, the rest at the gas price times the modifier.
 */
export function computeFee(gasLimit: bigint, data: string | undefined): bigint {
  const moveBalanceGas = getMoveBalanceGas(data);
  if (gasLimit < moveBalanceGas) {
    throw new Error(`Gas limit ${gasLimit} is below the move-balance cost ${moveBalanceGas}`);
  }
  return moveBalanceGas * BigInt(GAS_PRICE) + (gasLimit - moveBalanceGas) * MODIFIED_GAS_PRICE;
}
