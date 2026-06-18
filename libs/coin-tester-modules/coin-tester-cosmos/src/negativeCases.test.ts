import BigNumber from "bignumber.js";
import { createBridges } from "@ledgerhq/coin-cosmos/bridge/index";
import { CosmosCoinConfig } from "@ledgerhq/coin-cosmos/config";
import {
  CosmosAccount,
  CosmosCurrencyConfig,
  Transaction as CosmosTransaction,
} from "@ledgerhq/coin-cosmos/types/index";
import { makeAccount } from "./fixtures";
import { babylon, DEV_ADDRESS } from "./helpers";
import { buildSigner } from "./signer";

// Status-level negative cases. getTransactionStatus is in-memory logic (no
// network call), so these run WITHOUT spinning up the babylond devnet — unlike
// the happy-path scenario in scenarii/Babylon.ts. They guard the rejections a
// user can hit before signing: bad amount, bad recipient, not enough balance.
//
// Config is injected (LCD never reached); the values only need to be shaped
// like a live config so createBridges accepts them.
const coinConfig = {
  lcd: "http://127.0.0.1:1317",
  minGasPrice: 0.002,
  status: { type: "active" as const },
} satisfies CosmosCurrencyConfig & { status: { type: "active" } };

// 1 BABY = 1e6 ubbn (the base unit getTransactionStatus works in).
const BABY = (n: number): BigNumber => new BigNumber(n).times(1e6);

describe("Babylon negative cases (getTransactionStatus, no devnet)", () => {
  let accountBridge: ReturnType<typeof createBridges>["accountBridge"];
  let account: CosmosAccount;
  let bbnRecipient: string;

  beforeAll(async () => {
    const signer = await buildSigner();
    const signerContext: Parameters<typeof createBridges>[0] = (_, fn) => fn(signer);
    ({ accountBridge } = createBridges(
      signerContext,
      () => coinConfig as unknown as CosmosCoinConfig,
    ));

    // A distinct account index yields a valid bbn recipient that is NOT the
    // sender (so the send checks reach the amount/balance branch).
    bbnRecipient = (await signer.getAddressAndPubKey([44, 118, 1, 0, 0], "bbn")).bech32_address;

    account = {
      ...makeAccount(DEV_ADDRESS, babylon),
      balance: BABY(1),
      spendableBalance: BABY(1),
    };
  }, 30_000);

  it("rejects a send above the spendable balance with NotEnoughBalance", async () => {
    const transaction: CosmosTransaction = {
      ...accountBridge.createTransaction(account),
      mode: "send",
      recipient: bbnRecipient,
      amount: BABY(1000), // far more than the 1 BABY spendable balance
      fees: new BigNumber(5000),
    };
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("rejects a malformed recipient address with InvalidAddress", async () => {
    const transaction: CosmosTransaction = {
      ...accountBridge.createTransaction(account),
      mode: "send",
      // No bech32 separator → fails decode → InvalidAddress, independent of hrp.
      recipient: "not-a-valid-cosmos-address",
      amount: BABY(0.1),
      fees: new BigNumber(5000),
    };
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.recipient?.name).toBe("InvalidAddress");
  });

  it("rejects a zero-amount delegate with AmountRequired", async () => {
    const transaction: CosmosTransaction = {
      ...accountBridge.createTransaction(account),
      mode: "delegate",
      amount: new BigNumber(0),
      validators: [{ address: "bbnvaloper1validator", amount: new BigNumber(0) }],
      fees: new BigNumber(5000),
    };
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.amount?.name).toBe("AmountRequired");
  });

  it("rejects a delegate with no validators with InvalidAddress", async () => {
    const transaction: CosmosTransaction = {
      ...accountBridge.createTransaction(account),
      mode: "delegate",
      amount: BABY(1),
      validators: [],
      fees: new BigNumber(5000),
    };
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.recipient?.name).toBe("InvalidAddress");
  });
});
