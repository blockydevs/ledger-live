import type { TransactionIntent } from "@ledgerhq/coin-module-framework/api/types";
import { HEDERA_TRANSACTION_MODES } from "../constants";
import type { HederaMemo, HederaTxData } from "../types";

// The generic coin framework carries the UI-supplied validator node id as `valId` at
// the top level of the intent (see `getDelegationIntentFields` in
// generic-coin-framework/utils.ts), not inside `data`.
type IntentWithValId = TransactionIntent<HederaMemo, HederaTxData> & { valId?: string };

export function craftTransactionData(
  intent: TransactionIntent<HederaMemo, HederaTxData>,
): HederaTxData {
  if (intent.type === HEDERA_TRANSACTION_MODES.Undelegate) {
    return { type: "staking", stakingNodeId: null };
  }

  if (
    intent.type === HEDERA_TRANSACTION_MODES.Delegate ||
    intent.type === HEDERA_TRANSACTION_MODES.Redelegate
  ) {
    const valId = (intent as IntentWithValId).valId;
    return {
      type: "staking",
      stakingNodeId: typeof valId === "string" ? Number(valId) : undefined,
    };
  }

  if (intent.type === HEDERA_TRANSACTION_MODES.Send && intent.asset.type === "erc20") {
    return { type: "erc20" };
  }

  return { type: "none" };
}
