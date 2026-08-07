import BigNumber from "bignumber.js";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import type { ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import type { Transaction, HederaAccount } from "@ledgerhq/coin-hedera/types";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";

export type CanonicalHederaMode = "send" | "tokenAssociate" | "delegate" | "undelegate";

/**
 * The fields a Hedera scenario transaction varies on, independent of which bridge builds and
 * signs it. `toLegacyTransaction` and `toGenericHederaTransaction` map this to each bridge's own
 * transaction type, so a scenario is written once and runs against both.
 */
export type CanonicalHederaTransaction = {
  name: string;
  mode: CanonicalHederaMode;
  recipient: string;
  amount?: BigNumber;
  useAllAmount?: boolean;
  subAccountId?: string;
  memo?: string;
  stakingNodeId?: number | null;
  assetReference?: string;
  assetOwner?: string;
  token?: TokenCurrency;
  expect?: (previous: HederaAccount, current: HederaAccount) => void;
  xexpect?: (previous: HederaAccount, current: HederaAccount) => void;
};

const ZERO = new BigNumber(0);

export function toLegacyTransaction(
  c: CanonicalHederaTransaction,
): ScenarioTransaction<Transaction, HederaAccount> {
  const common = { name: c.name, expect: c.expect, xexpect: c.xexpect };

  switch (c.mode) {
    case "send":
      return {
        ...common,
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Send,
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
        useAllAmount: c.useAllAmount,
        subAccountId: c.subAccountId,
        memo: c.memo,
      };
    case "tokenAssociate": {
      if (!c.assetReference || !c.assetOwner || !c.token) {
        throw new Error(`canonical transaction "${c.name}" is missing token-associate fields`);
      }
      return {
        ...common,
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: c.assetReference,
        assetOwner: c.assetOwner,
        properties: { token: c.token },
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
      };
    }
    case "delegate":
      return {
        ...common,
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Delegate,
        properties: { stakingNodeId: c.stakingNodeId ?? null },
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
      };
    case "undelegate":
      return {
        ...common,
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Undelegate,
        properties: { stakingNodeId: null },
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
      };
  }
}

export function toGenericHederaTransaction(
  c: CanonicalHederaTransaction,
): ScenarioTransaction<GenericTransaction, HederaAccount> {
  const common = { name: c.name, expect: c.expect, xexpect: c.xexpect };

  switch (c.mode) {
    case "send":
      return {
        ...common,
        family: "hedera",
        mode: "send",
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
        useAllAmount: c.useAllAmount,
        subAccountId: c.subAccountId,
        memoType: c.memo ? "text" : undefined,
        memoValue: c.memo,
      };
    case "tokenAssociate": {
      if (!c.assetReference || !c.assetOwner) {
        throw new Error(`canonical transaction "${c.name}" is missing token-associate fields`);
      }
      return {
        ...common,
        family: "hedera",
        mode: "token-associate",
        assetReference: c.assetReference,
        assetOwner: c.assetOwner,
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
      };
    }
    case "delegate":
      return {
        ...common,
        family: "hedera",
        mode: "delegate",
        valId: c.stakingNodeId != null ? String(c.stakingNodeId) : undefined,
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
      };
    case "undelegate":
      return {
        ...common,
        family: "hedera",
        mode: "undelegate",
        amount: c.amount ?? ZERO,
        recipient: c.recipient,
      };
  }
}
