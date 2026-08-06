import BigNumber from "bignumber.js";
import { firstValueFrom, reduce } from "rxjs";
import type { AccountBridge } from "@ledgerhq/types-live";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { createBridges } from "@ledgerhq/coin-casper/bridge";
import { setCoinConfig } from "@ledgerhq/coin-casper/config";
import resolver from "@ledgerhq/coin-casper/signer";
import {
  CASPER_FEES_MOTES,
  CASPER_MAX_TRANSFER_ID,
  CASPER_MINIMUM_VALID_AMOUNT_MOTES,
} from "@ledgerhq/coin-casper/consts";
import type { CasperAccount, Transaction } from "@ledgerhq/coin-casper/types";
import { deriveUser } from "./casperDevnet";
import {
  DEVNET_SANITY_USER_INDEX,
  liveDerivationPath,
  makeAccount,
  RECIPIENT_USER_INDEX,
  scenarioCoinConfig,
} from "./fixtures";
import { startIndexer } from "./indexer";
import { buildCasperSigner } from "./signer";

global.console = require("console");
jest.setTimeout(600_000);

const feesMotes = new BigNumber(CASPER_FEES_MOTES);
const minimumValidAmountMotes = new BigNumber(CASPER_MINIMUM_VALID_AMOUNT_MOTES);

// getTransactionStatus errors that need a real synced balance and a real
// chain-derived recipient — a mocked account can't stand in for them. Run
// against DEVNET_SANITY_USER_INDEX since executeScenario only covers happy paths.
describe("Casper negative cases (devnet)", () => {
  let accountBridge: AccountBridge<Transaction, CasperAccount>;
  let account: CasperAccount;
  let recipientPublicKey: string;
  let closeIndexer: () => void;

  beforeAll(async () => {
    closeIndexer = startIndexer();

    setCoinConfig(() => scenarioCoinConfig);
    LiveConfig.setConfig({
      config_currency_casper: { type: "object", default: scenarioCoinConfig },
    });

    const sender = await deriveUser(DEVNET_SANITY_USER_INDEX);
    const recipient = await deriveUser(RECIPIENT_USER_INDEX);
    recipientPublicKey = recipient.publicKey;

    const signer = buildCasperSigner({
      [liveDerivationPath(DEVNET_SANITY_USER_INDEX)]: sender.secretKey,
    });
    const signerContext: Parameters<typeof resolver>[0] = (_, fn) => fn(signer);
    ({ accountBridge } = createBridges(signerContext, () => scenarioCoinConfig));

    const initial = makeAccount({ publicKey: sender.publicKey, index: DEVNET_SANITY_USER_INDEX });
    account = await firstValueFrom(
      accountBridge
        .sync(initial, { paginationConfig: {} })
        .pipe(reduce((acc, f) => f(acc), initial)),
    );
    expect(account.balance.gt(0)).toBe(true);
  });

  afterAll(() => {
    closeIndexer?.();
  });

  // getTransactionStatus reads transaction.fees directly rather than
  // estimating it, so the fee has to be supplied here for totalSpent to mean
  // anything.
  const build = (patch: Partial<Transaction>): Transaction =>
    accountBridge.updateTransaction(accountBridge.createTransaction(account), {
      fees: feesMotes,
      ...patch,
    } as Partial<Transaction>);

  it("flags a spend above the synced balance (NotEnoughBalance)", async () => {
    const tx = build({
      recipient: recipientPublicKey,
      amount: account.balance.times(2),
    });
    const status = await accountBridge.getTransactionStatus(account, tx);
    expect(status.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("flags an amount below CASPER_MINIMUM_VALID_AMOUNT_MOTES (InvalidMinimumAmount)", async () => {
    const tx = build({
      recipient: recipientPublicKey,
      amount: minimumValidAmountMotes.minus(1),
    });
    const status = await accountBridge.getTransactionStatus(account, tx);
    expect(status.errors.amount?.name).toBe("InvalidMinimumAmount");
  });

  it("flags a recipient with a broken CEP-57 checksum (InvalidAddress)", async () => {
    // isAddressValid only treats a key as checksummed (and verifies it) once
    // it has both a lower- and an upper-case letter, so the flipped character
    // has to be one of the hex digits a-f, not a decimal digit.
    const letterIndex = [...recipientPublicKey].findIndex(c => /[a-f]/.test(c));
    const brokenChecksum =
      recipientPublicKey.slice(0, letterIndex) +
      recipientPublicKey[letterIndex].toUpperCase() +
      recipientPublicKey.slice(letterIndex + 1);
    const tx = build({
      recipient: brokenChecksum,
      amount: minimumValidAmountMotes,
    });
    const status = await accountBridge.getTransactionStatus(account, tx);
    expect(status.errors.recipient?.name).toBe("InvalidAddress");
  });

  it("flags a transferId at CASPER_MAX_TRANSFER_ID (CasperInvalidTransferId)", async () => {
    // validateMemo requires strictly less than the max, so the max itself is
    // already invalid.
    const tx = build({
      recipient: recipientPublicKey,
      amount: minimumValidAmountMotes,
      transferId: CASPER_MAX_TRANSFER_ID,
    });
    const status = await accountBridge.getTransactionStatus(account, tx);
    expect(status.errors.transaction?.name).toBe("CasperInvalidTransferId");
  });
});
