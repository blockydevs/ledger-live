import type { TransactionIntent } from "@ledgerhq/coin-module-framework/api/types";
import { HEDERA_TRANSACTION_MODES } from "../constants";
import type { HederaMemo, HederaTxData } from "../types";
import { craftTransactionData } from "./craftTransactionData";

type IntentWithValId = TransactionIntent<HederaMemo, HederaTxData> & { valId?: string };

describe("craftTransactionData", () => {
  const baseIntent = {
    intentType: "transaction",
    sender: "0.0.54321",
    recipient: "0.0.54321",
    amount: 0n,
    asset: { type: "native" },
  } as unknown as TransactionIntent<HederaMemo, HederaTxData>;

  it("maps valId to staking data for delegate", () => {
    const intent: IntentWithValId = {
      ...baseIntent,
      intentType: "staking",
      type: HEDERA_TRANSACTION_MODES.Delegate,
      valId: "7",
    };

    expect(craftTransactionData(intent)).toEqual({ type: "staking", stakingNodeId: 7 });
  });

  it("maps valId to staking data for redelegate", () => {
    const intent: IntentWithValId = {
      ...baseIntent,
      intentType: "staking",
      type: HEDERA_TRANSACTION_MODES.Redelegate,
      valId: "12",
    };

    expect(craftTransactionData(intent)).toEqual({ type: "staking", stakingNodeId: 12 });
  });

  it("maps undelegate to a null staking node id", () => {
    const intent: IntentWithValId = {
      ...baseIntent,
      intentType: "staking",
      type: HEDERA_TRANSACTION_MODES.Undelegate,
    };

    expect(craftTransactionData(intent)).toEqual({ type: "staking", stakingNodeId: null });
  });

  it("returns the erc20 data type for erc20 transfers", () => {
    const intent: TransactionIntent<HederaMemo, HederaTxData> = {
      ...baseIntent,
      type: HEDERA_TRANSACTION_MODES.Send,
      asset: { type: "erc20", assetReference: "0x39ceba2b467fa987546000eb5d1373acf1f3a2e" },
    };

    expect(craftTransactionData(intent)).toEqual({ type: "erc20" });
  });

  it("returns none for a plain hbar send", () => {
    const intent: TransactionIntent<HederaMemo, HederaTxData> = {
      ...baseIntent,
      type: HEDERA_TRANSACTION_MODES.Send,
      asset: { type: "native" },
    };

    expect(craftTransactionData(intent)).toEqual({ type: "none" });
  });

  it("returns none for a token associate", () => {
    const intent: TransactionIntent<HederaMemo, HederaTxData> = {
      ...baseIntent,
      type: HEDERA_TRANSACTION_MODES.TokenAssociate,
      asset: { type: "hts", assetReference: "0.0.7890" },
    };

    expect(craftTransactionData(intent)).toEqual({ type: "none" });
  });
});
