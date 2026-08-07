// Encapsulate for LLD & LLM
export * from "@ledgerhq/coin-hedera/types/index";

import type { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import type {
  GenericTransaction,
  GenericTransactionMode,
  GenericTransactionRaw,
} from "../../bridge/generic-coin-framework/types";

// Shape actually produced by the generic coin framework bridge, narrowed to hedera's family tag.
// Shadows the legacy discriminated-union `Transaction`/`TransactionRaw` re-exported above (TS
// resolves the name clash in favor of the local declaration), matching the pattern already used
// by `families/stellar/types.ts` and `families/tezos/types.ts`.
//
// `mode` widens past the framework's own `GenericTransactionMode` to also accept
// `HEDERA_TRANSACTION_MODES`: `HEDERA_TRANSACTION_MODES.ClaimRewards` ("claim-rewards") has no
// equivalent literal in `GenericTransactionMode`, and coin-hedera's own craftTransaction/intent
// pipeline reads `mode` as one of `HEDERA_TRANSACTION_MODES` regardless.
export type Transaction = Omit<GenericTransaction, "mode"> & {
  family: "hedera";
  mode?: GenericTransactionMode | HEDERA_TRANSACTION_MODES;
};
export type TransactionRaw = Omit<GenericTransactionRaw, "mode"> & {
  family: "hedera";
  mode?: GenericTransactionMode | HEDERA_TRANSACTION_MODES;
};
