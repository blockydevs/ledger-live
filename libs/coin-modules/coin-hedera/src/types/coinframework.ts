import type { StringMemo, TxDataNotSupported } from "@ledgerhq/coin-module-framework/api/types";

export type HederaMemo = StringMemo;

export type HederaTxData =
  | TxDataNotSupported
  | {
      type: "erc20";
      // Set only by the legacy bridge's `signOperation`, which has no `customFees` channel for
      // gas and packs the estimate into `data` instead; `craftTransaction` falls back to it when
      // `customFees.parameters.gasLimit` is absent.
      gasLimit?: bigint;
    }
  | {
      type: "staking";
      stakingNodeId: number | null | undefined;
    };
