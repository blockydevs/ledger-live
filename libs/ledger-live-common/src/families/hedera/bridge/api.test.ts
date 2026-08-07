import BigNumber from "bignumber.js";
import type { Balance } from "@ledgerhq/coin-module-framework/api/types";
import type { Operation } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { HederaAccount } from "@ledgerhq/coin-hedera/types";
import hederaBridge, { computeIntentType } from "./api";

const currency = { id: "hedera", family: "hedera" } as never;

describe("computeIntentType", () => {
  it("passes through every supported mode unchanged", () => {
    for (const mode of [
      "send",
      "token-associate",
      "delegate",
      "undelegate",
      "redelegate",
      "claim-rewards",
    ]) {
      expect(computeIntentType({ mode })).toBe(mode);
    }
  });

  it("defaults to send when no mode is set", () => {
    expect(computeIntentType({})).toBe("send");
  });

  it("throws on an unsupported mode", () => {
    expect(() => computeIntentType({ mode: "changeTrust" })).toThrow(
      /Unsupported transaction mode/,
    );
  });
});

describe("hederaBridge().enrichOptimisticOperation", () => {
  const baseOperation = {
    id: "op1",
    senders: ["0.0.1001-abcde"],
    recipients: ["0.0.1002-fghij"],
    extra: {},
  } as unknown as Operation;

  it("strips the Hedera checksum from senders and recipients on a native send", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "send" },
      baseOperation,
    );

    expect(enriched.senders).toEqual(["0.0.1001"]);
    expect(enriched.recipients).toEqual(["0.0.1002"]);
  });

  it("leaves a raw EVM recipient untouched on an ERC20 send", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;
    const erc20Operation = { ...baseOperation, recipients: ["0xabc123"] } as unknown as Operation;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "send", assetReference: "0xdeadbeef" },
      erc20Operation,
    );

    expect(enriched.recipients).toEqual(["0xabc123"]);
  });

  it("attaches the token id on a token-associate transaction", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "token-associate", assetReference: "0.0.5005" },
      baseOperation,
    );

    expect((enriched.extra as Record<string, unknown>).associatedTokenId).toBe("0.0.5005");
  });

  it("attaches target and previous staking node ids on a delegation", () => {
    const bridge = hederaBridge(currency);
    const account = {
      stakingPositions: [{ details: { stakedNodeId: 3 } }],
    } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "delegate", valId: "7" },
      baseOperation,
    );

    expect((enriched.extra as Record<string, unknown>).targetStakingNodeId).toBe(7);
    expect((enriched.extra as Record<string, unknown>).previousStakingNodeId).toBe(3);
  });

  it("attaches the memo on a native send", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "send", memoType: "text", memoValue: "invoice 42" },
      baseOperation,
    );

    expect((enriched.extra as Record<string, unknown>).memo).toBe("invoice 42");
  });

  it("attaches the memo on an ERC20 send", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "send", assetReference: "0xdeadbeef", memoValue: "for the invoice" },
      baseOperation,
    );

    expect((enriched.extra as Record<string, unknown>).memo).toBe("for the invoice");
  });

  it("omits the memo key entirely when no memo was set on a send", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "send" },
      baseOperation,
    );

    expect(enriched.extra as Record<string, unknown>).not.toHaveProperty("memo");
  });

  it("attaches the memo on a delegation, and null when it is absent", () => {
    const bridge = hederaBridge(currency);
    const account = {
      stakingPositions: [{ details: { stakedNodeId: 3 } }],
    } as unknown as HederaAccount;

    const withMemo = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "delegate", valId: "7", memoValue: "staking up" },
      baseOperation,
    );
    const withoutMemo = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "delegate", valId: "7" },
      baseOperation,
    );

    expect((withMemo.extra as Record<string, unknown>).memo).toBe("staking up");
    expect((withoutMemo.extra as Record<string, unknown>).memo).toBeNull();
  });

  it("sets the value and recipient of a claim-rewards operation from the configured account", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;
    const zeroValueOperation = {
      ...baseOperation,
      value: new BigNumber(0),
      recipients: [""],
    } as unknown as Operation;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "claim-rewards" },
      zeroValueOperation,
    );

    expect(enriched.value).toEqual(new BigNumber(1));
    expect(enriched.recipients).toEqual(["0.0.163372"]);
  });

  it("does not attach a memo on a token-associate transaction", () => {
    const bridge = hederaBridge(currency);
    const account = { stakingPositions: [] } as unknown as HederaAccount;

    const enriched = bridge.enrichOptimisticOperation!(
      account as never,
      { mode: "token-associate", assetReference: "0.0.5005", memoValue: "ignored" },
      baseOperation,
    );

    expect(enriched.extra as Record<string, unknown>).not.toHaveProperty("memo");
  });
});

describe("hederaBridge().mapOperationDetailsToExtra", () => {
  it("copies only the Hedera-specific keys", () => {
    const bridge = hederaBridge(currency);

    const extra = bridge.mapOperationDetailsToExtra!({
      consensusTimestamp: "1699999999.000000001",
      transactionId: "0.0.1234567-1699999999-000000000",
      associatedTokenId: "0.0.5005",
      targetStakingNodeId: 7,
      previousStakingNodeId: 3,
      gasConsumed: 100,
      gasUsed: 90,
      gasLimit: 21000,
      ledgerOpType: "OUT",
      unrelatedKey: "should not appear",
    });

    expect(extra).toEqual({
      consensusTimestamp: "1699999999.000000001",
      transactionId: "0.0.1234567-1699999999-000000000",
      associatedTokenId: "0.0.5005",
      targetStakingNodeId: 7,
      previousStakingNodeId: 3,
      gasConsumed: 100,
      gasUsed: 90,
      gasLimit: 21000,
    });
  });
});

describe("hederaBridge().keepFeesOnlyNativeOpType", () => {
  it("is set, so a standalone fee-only native OUT keeps its type instead of collapsing to FEES", () => {
    const bridge = hederaBridge(currency);

    expect(bridge.keepFeesOnlyNativeOpType).toBe(true);
  });
});

describe("hederaBridge().shouldBuildTokenAccount", () => {
  const erc20Token = { tokenType: "erc20" } as unknown as TokenCurrency;
  const htsToken = { tokenType: "hts" } as unknown as TokenCurrency;

  it("vetoes an untouched ERC20 token (zero balance, no operations)", () => {
    const bridge = hederaBridge(currency);
    const balance = { value: 0n, asset: { type: "erc20" } } as unknown as Balance;

    expect(bridge.shouldBuildTokenAccount!(balance, erc20Token, [])).toBe(false);
  });

  it("keeps an ERC20 token once it has any operation, even at zero balance", () => {
    const bridge = hederaBridge(currency);
    const balance = { value: 0n, asset: { type: "erc20" } } as unknown as Balance;
    const op = { id: "op1" } as unknown as Operation;

    expect(bridge.shouldBuildTokenAccount!(balance, erc20Token, [op])).toBe(true);
  });

  it("keeps a zero-balance, no-ops HTS token (e.g. right after association)", () => {
    const bridge = hederaBridge(currency);
    const balance = { value: 0n, asset: { type: "hts" } } as unknown as Balance;

    expect(bridge.shouldBuildTokenAccount!(balance, htsToken, [])).toBe(true);
  });
});
