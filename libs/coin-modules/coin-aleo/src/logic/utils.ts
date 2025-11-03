import { AssetInfo } from "@ledgerhq/coin-framework/lib/api/types";
import { AleoOperationExtra } from "../types";
import type { Operation as LiveOperation } from "@ledgerhq/types-live";

export const getOperationValue = ({
  asset,
  operation,
}: {
  asset: AssetInfo;
  operation: LiveOperation<AleoOperationExtra>;
}) => {
  if (operation.type === "FEES") {
    return BigInt(0);
  }

  if (asset.type === "native" && operation.type === "OUT") {
    return BigInt(operation.value.toFixed(0)) - BigInt(operation.fee.toFixed(0));
  }

  return BigInt(operation.value.toFixed(0));
};
