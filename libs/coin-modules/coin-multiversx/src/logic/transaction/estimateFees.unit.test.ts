import type {
  StakingTransactionIntent,
  TransactionIntent,
} from "@ledgerhq/coin-module-framework/api/index";
import { GAS, GAS_PRICE, MIN_GAS_LIMIT } from "../../constants";
import { getFees } from "../../network/sdk";
import type { Transaction } from "../../types";
import { buildTransactionPayload } from "./craftTransaction";
import { estimateFees } from "./estimateFees";

const SENDER = "erd1spyavw0956vq68xj8y4tenjpq2wd5a9p2c6j8gsz7ztyrnpxrruqzu66jx";
const PROVIDER = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l";
const ONE_EGLD = 10n ** 18n;

function nativeIntent(amount = 1000n): TransactionIntent {
  return {
    intentType: "transaction",
    type: "send",
    sender: SENDER,
    recipient: SENDER,
    amount,
    asset: { type: "native" },
  };
}

function stakingIntent(type: string, amount = ONE_EGLD): StakingTransactionIntent {
  return {
    ...nativeIntent(amount),
    recipient: PROVIDER,
    type,
  } as unknown as StakingTransactionIntent;
}

const esdtIntent: TransactionIntent = {
  ...nativeIntent(500n),
  asset: { type: "esdt", assetReference: "USDC-c76f1f" },
};

// The legacy bridge prices a transaction with the MultiversX SDK's `computeFee`.
async function legacyFee(intent: TransactionIntent | StakingTransactionIntent, gasLimit?: number) {
  const payload = buildTransactionPayload(intent);
  const fee = await getFees({
    data: payload.data,
    gasLimit: gasLimit ?? payload.gasLimit,
  } as unknown as Transaction);
  return BigInt(fee.toFixed());
}

describe("estimateFees", () => {
  it.each<[string, TransactionIntent | StakingTransactionIntent]>([
    ["a native transfer", nativeIntent()],
    ["an ESDT transfer", esdtIntent],
    ["a delegation", stakingIntent("delegate")],
    ["an undelegation", stakingIntent("unDelegate")],
    ["a withdrawal", stakingIntent("withdraw", 0n)],
    ["a re-delegation of rewards", stakingIntent("reDelegateRewards", 0n)],
    ["a rewards claim", stakingIntent("claimRewards", 0n)],
  ])("prices %s as the legacy bridge does", async (_name, intent) => {
    const fee = await estimateFees(intent);

    expect(fee.value).toBe(await legacyFee(intent));
  });

  it("keeps a plain EGLD transfer at its base cost", async () => {
    const fee = await estimateFees(nativeIntent());

    expect(fee.value).toBe(BigInt(MIN_GAS_LIMIT) * BigInt(GAS_PRICE));
  });

  it("charges the data bytes: two undelegations of different amounts cost differently", async () => {
    const small = await estimateFees(stakingIntent("unDelegate", 1n));
    const large = await estimateFees(stakingIntent("unDelegate", 1000n * ONE_EGLD));

    expect(large.value).toBeGreaterThan(small.value);
  });

  it("bills a staking operation's execution gas at the modified price, far below its gas limit", async () => {
    const fee = await estimateFees(stakingIntent("delegate"));

    expect(fee.value).toBeLessThan((BigInt(GAS.DELEGATE) * BigInt(GAS_PRICE)) / 50n);
  });

  it.each([1_000_000, 1_000_000n])(
    "prices a caller-supplied gas limit (%p) with the same formula",
    async gasLimit => {
      const fee = await estimateFees(esdtIntent, { gasLimit });

      expect(fee.value).toBe(await legacyFee(esdtIntent, 1_000_000));
      expect(fee.parameters).toEqual({ gasLimit });
    },
  );
});
