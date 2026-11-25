import type {
  FeeEstimation,
  StakingTransactionIntent,
  TransactionIntent,
} from "@ledgerhq/coin-module-framework/api/index";
import { computeFee } from "./computeFee";
import { buildTransactionPayload } from "./craftTransaction";

/** The caller's gas limit, `undefined` when it set none; an invalid value throws. */
export function getCustomGasLimit(
  parameters: FeeEstimation["parameters"] | undefined,
): bigint | undefined {
  const gasLimit = parameters?.gasLimit;
  return gasLimit === undefined || gasLimit === null ? undefined : BigInt(String(gasLimit));
}

/** The fee on the gas limit and `data` that `craftTransaction` puts on the wire for this intent. */
export async function estimateFees(
  intent: TransactionIntent | StakingTransactionIntent,
  customFeesParameters?: FeeEstimation["parameters"],
): Promise<FeeEstimation> {
  const { data, gasLimit } = buildTransactionPayload(intent);

  const customGasLimit = getCustomGasLimit(customFeesParameters);
  if (customGasLimit !== undefined && customFeesParameters) {
    return { value: computeFee(customGasLimit, data), parameters: customFeesParameters };
  }

  return { value: computeFee(BigInt(gasLimit), data), parameters: { gasLimit } };
}
