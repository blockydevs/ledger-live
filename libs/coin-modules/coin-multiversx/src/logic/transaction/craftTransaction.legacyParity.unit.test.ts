import type {
  StakingTransactionIntent,
  TransactionIntent,
} from "@ledgerhq/coin-module-framework/api/index";
import BigNumber from "bignumber.js";
import { doBuildTransactionToSign } from "../../buildTransaction";
import { CHAIN_ID, GAS, MIN_GAS_LIMIT } from "../../constants";
import { MultiversXEncodeTransaction } from "../../encode";
import type { MultiversXNetworkApi } from "../../network/api";
import type { Transaction } from "../../types";
import { craftTransaction } from "./craftTransaction";

// app-multiversx hash-signs the JSON bytes it receives, so the generic path signs exactly what the
// legacy path signs only if both produce the same string for the same transaction.

const SENDER = "erd1spyavw0956vq68xj8y4tenjpq2wd5a9p2c6j8gsz7ztyrnpxrruqzu66jx";
const RECIPIENT = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l";
const PROVIDER = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u";
const NONCE = 12;
const AMOUNT = 1_500_000_000_000_000_000n;

const api = {
  getAccountNonce: jest.fn().mockResolvedValue(NONCE),
  getNetworkConfig: jest.fn().mockResolvedValue({ chainID: CHAIN_ID }),
} as unknown as MultiversXNetworkApi;

function legacy(transaction: Partial<Transaction>, value: string): Promise<string> {
  return doBuildTransactionToSign({
    transaction: { amount: new BigNumber(AMOUNT.toString()), ...transaction } as Transaction,
    sender: SENDER,
    nonce: NONCE,
    value,
    minGasLimit: MIN_GAS_LIMIT,
    chainID: CHAIN_ID,
  });
}

function stakingIntent(type: string): StakingTransactionIntent {
  return {
    intentType: "staking",
    type,
    sender: SENDER,
    recipient: PROVIDER,
    amount: AMOUNT,
    asset: { type: "native" },
  } as unknown as StakingTransactionIntent;
}

describe("craftTransaction parity with the legacy bridge", () => {
  it("crafts the same bytes for a native transfer", async () => {
    const intent: TransactionIntent = {
      intentType: "transaction",
      type: "send",
      sender: SENDER,
      recipient: RECIPIENT,
      amount: AMOUNT,
      asset: { type: "native" },
    };

    const { transaction } = await craftTransaction(api, intent);

    expect(transaction).toBe(
      await legacy(
        { recipient: RECIPIENT, gasLimit: MIN_GAS_LIMIT, mode: "send" },
        AMOUNT.toString(),
      ),
    );
  });

  it("crafts the same bytes for an ESDT transfer", async () => {
    const intent: TransactionIntent = {
      intentType: "transaction",
      type: "send",
      sender: SENDER,
      recipient: RECIPIENT,
      amount: 500n,
      asset: { type: "esdt", assetReference: "USDC-c76f1f" },
    };
    const data = Buffer.from(
      `ESDTTransfer@${Buffer.from("USDC-c76f1f").toString("hex")}@01f4`,
    ).toString("base64");

    const { transaction } = await craftTransaction(api, intent);

    expect(transaction).toBe(
      await legacy({ recipient: RECIPIENT, gasLimit: GAS.ESDT_TRANSFER, data, mode: "send" }, "0"),
    );
  });

  it.each<[string, string, number, string]>([
    ["delegate", MultiversXEncodeTransaction.delegate(), GAS.DELEGATE, AMOUNT.toString()],
    [
      "unDelegate",
      MultiversXEncodeTransaction.unDelegate({
        amount: new BigNumber(AMOUNT.toString()),
      } as Transaction),
      GAS.DELEGATE,
      "0",
    ],
    ["claimRewards", MultiversXEncodeTransaction.claimRewards(), GAS.CLAIM, "0"],
    ["withdraw", MultiversXEncodeTransaction.withdraw(), GAS.DELEGATE, "0"],
    ["reDelegateRewards", MultiversXEncodeTransaction.reDelegateRewards(), GAS.DELEGATE, "0"],
  ])("crafts the same bytes for %s", async (mode, data, gasLimit, value) => {
    const { transaction } = await craftTransaction(api, stakingIntent(mode));

    expect(transaction).toBe(
      await legacy(
        { recipient: PROVIDER, gasLimit, data, mode: mode as Transaction["mode"] },
        value,
      ),
    );
  });
});
