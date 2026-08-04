import { convertICXtoLoop, getNid } from "@ledgerhq/coin-icon/logic";
import { RPC_VERSION } from "@ledgerhq/coin-icon/constants";
import BigNumber from "bignumber.js";
import IconService from "icon-sdk-js";
import { firstValueFrom, reduce } from "rxjs";
import { createRandomWallet, fundAccount, icon, makeIconAccount, STEP_PRICE } from "./fixtures";
import { getBridges, rpc, waitForTransaction } from "./helpers";
import { initIndexer, registerTransaction } from "./indexer";
import { buildIconSigner } from "./signer";

const { IconBuilder, IconConverter, SignedTransaction } = IconService;
const { IcxTransactionBuilder } = IconBuilder;

// No payable fallback: a plain ICX transfer to this address always reverts.
const GOVERNANCE_ADDRESS = "cx0000000000000000000000000000000000000001";

// estimateStep refuses to estimate a reverting call, so this step limit is
// set explicitly, outside the bridge. Measured step use for this call is
// 1,015,000; this leaves headroom.
const REVERTING_STEP_LIMIT = 2_000_000;

const FUNDING_ICX = new BigNumber(10);
const TRANSFER_ICX = new BigNumber(1);

global.console = require("console");
jest.setTimeout(60_000);

describe("failed operation", () => {
  it("reports a reverted transfer to the governance SCORE", async () => {
    const closeIndexer = initIndexer();
    try {
      const testWallet = createRandomWallet();
      const testAddress = testWallet.getAddress();
      await fundAccount(testAddress, FUNDING_ICX);

      const signer = buildIconSigner(testWallet.getPrivateKey());
      const { accountBridge } = getBridges(signer);

      const account = makeIconAccount(testAddress);
      const before = await firstValueFrom(
        accountBridge
          .sync(account, { paginationConfig: {} })
          .pipe(reduce((acc, f) => f(acc), account)),
      );

      const transaction = new IcxTransactionBuilder()
        .from(testAddress)
        .to(GOVERNANCE_ADDRESS)
        .value(IconConverter.toHexNumber(convertICXtoLoop(TRANSFER_ICX)))
        .stepLimit(IconConverter.toHexNumber(REVERTING_STEP_LIMIT))
        .nid(IconConverter.toHexNumber(getNid(icon)))
        .nonce(IconConverter.toHexNumber(Date.now()))
        .version(IconConverter.toHexNumber(RPC_VERSION))
        .timestamp(IconConverter.toHexNumber(Date.now() * 1000))
        .build();

      const signedTransaction = new SignedTransaction(transaction, testWallet);
      const hash = await rpc.sendTransaction(signedTransaction).execute();
      const receipt = await waitForTransaction(hash);

      // status "0x0" is a reverted call; only "0x1" is success.
      expect(receipt.status.toString()).not.toBe("1");

      registerTransaction(hash);

      const after = await firstValueFrom(
        accountBridge
          .sync(before, { paginationConfig: {} })
          .pipe(reduce((acc, f) => f(acc), before)),
      );

      const op = after.operations.find(operation => operation.hash === hash);
      if (!op) throw new Error("operation for the reverted transfer was not synced");

      const fee = receipt.stepUsed.multipliedBy(STEP_PRICE);

      expect(op.hasFailed).toBe(true);
      expect(op.fee.toFixed()).toBe(fee.toFixed());
      expect(after.balance.toFixed()).toBe(before.balance.minus(fee).toFixed());
      expect(op.value.toFixed()).toBe(fee.toFixed());
    } finally {
      closeIndexer();
    }
  });
});
