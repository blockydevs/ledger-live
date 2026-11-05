import BigNumber from "bignumber.js";
import type { Account, AccountBridge, TransactionStatusCommon } from "@ledgerhq/types-live";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import { makeXrpAccount } from "./fixtures";
import { getBridges, newFundedWallet, setLocalXrpConfig, syncAccount } from "./helpers";
import {
  ASF_DEFAULT_RIPPLE,
  ASF_REQUIRE_DEST,
  enableAccountFlag,
  freezeTrustLine,
  issue,
  openTrustLine,
  setTransferRate,
} from "./local-tx";
import { getAccountSequence, newWallet, type XrplWallet } from "./rippled";
import { buildXrpSigner } from "./signer";
import { installTokenStore, iouAmount, makeIouToken } from "./tokens";

global.console = require("console");
jest.setTimeout(600_000);

type Wallets = { holder: XrplWallet; issuer: XrplWallet; recipient: XrplWallet };

type SyncedHolder = {
  issuer: XrplWallet;
  accountBridge: AccountBridge<GenericTransaction>;
  account: Account;
  subAccountId: string;
  signTransaction: jest.SpyInstance;
};

/**
 * The holder holds 10 USD on a line with limit 1000. `recipientLimit` is the recipient's USD
 * limit, `null` for no line.
 */
async function createWallets(recipientLimit: string | null = "1000"): Promise<Wallets> {
  const holder = await newFundedWallet();
  const issuer = await newFundedWallet();
  const recipient = await newFundedWallet();
  // Without it, a holder-to-recipient payment cannot ripple through the issuer.
  await enableAccountFlag(issuer, ASF_DEFAULT_RIPPLE);

  await openTrustLine(holder, { currency: "USD", issuer: issuer.address, limit: "1000" });
  await issue(issuer, holder.address, { currency: "USD", issuer: issuer.address, value: "10" });
  if (recipientLimit !== null) {
    await openTrustLine(recipient, {
      currency: "USD",
      issuer: issuer.address,
      limit: recipientLimit,
    });
  }

  return { holder, issuer, recipient };
}

async function syncHolder({ holder, issuer }: Wallets): Promise<SyncedHolder> {
  const token = makeIouToken("USD", issuer.address);
  installTokenStore([token]);
  setLocalXrpConfig(["iou"]);

  const signer = buildXrpSigner(holder);
  const signTransaction = jest.spyOn(signer, "signTransaction");
  const { accountBridge } = await getBridges(signer);
  const account = await syncAccount(accountBridge, makeXrpAccount(holder.address));
  const subAccountId = encodeTokenAccountId(account.id, token);

  return { issuer, accountBridge, account, subAccountId, signTransaction };
}

/** Also asserts that the status check signed nothing and put nothing on the ledger. */
async function getSendStatus(
  { issuer, accountBridge, account, subAccountId, signTransaction }: SyncedHolder,
  recipient: string,
  amount: BigNumber,
): Promise<TransactionStatusCommon> {
  const transaction = accountBridge.updateTransaction(accountBridge.createTransaction(account), {
    subAccountId,
    recipient,
    amount,
    assetReference: "USD",
    assetOwner: issuer.address,
  });
  const sequenceBefore = await getAccountSequence(account.freshAddress);
  const prepared = await accountBridge.prepareTransaction(account, transaction);
  const status = await accountBridge.getTransactionStatus(account, prepared);

  expect(signTransaction).not.toHaveBeenCalled();
  expect(await getAccountSequence(account.freshAddress)).toBe(sequenceBefore);

  return status;
}

describe("XRP refused IOU sends", () => {
  let stopRemoteGuard: () => void;

  beforeAll(() => {
    stopRemoteGuard = forbidRemoteRequests();
  });

  afterAll(() => {
    stopRemoteGuard?.();
  });

  it("frozen line refuses the send", async () => {
    const wallets = await createWallets();
    await freezeTrustLine(wallets.issuer, { holder: wallets.holder.address, currency: "USD" });
    const synced = await syncHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, iouAmount("1"));

    expect(status.errors.amount?.name).toBe("XrpTokenFrozen");
  });

  it("frozen line still pays the issuer", async () => {
    const wallets = await createWallets();
    await freezeTrustLine(wallets.issuer, { holder: wallets.holder.address, currency: "USD" });
    const synced = await syncHolder(wallets);

    const status = await getSendStatus(synced, wallets.issuer.address, iouAmount("1"));

    expect(status.errors).toEqual({});
  });

  it("recipient without a trust line", async () => {
    const wallets = await createWallets(null);
    const synced = await syncHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, iouAmount("1"));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });

  it("recipient limit below the amount", async () => {
    const wallets = await createWallets("5");
    const synced = await syncHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, iouAmount("6"));

    expect(status.errors.amount?.name).toBe("XrpTokenAmountNotDeliverable");
  });

  it("amount plus transfer rate above balance", async () => {
    const wallets = await createWallets();
    await setTransferRate(wallets.issuer, 1_250_000_000);
    const synced = await syncHolder(wallets);

    // 9 USD under a 25 % rate debits 11.25 of the 10 held.
    const status = await getSendStatus(synced, wallets.recipient.address, iouAmount("9"));

    expect(status.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("recipient account does not exist", async () => {
    const wallets = await createWallets();
    const synced = await syncHolder(wallets);

    const status = await getSendStatus(synced, newWallet().address, iouAmount("1"));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });

  it("recipient requires a destination tag", async () => {
    const wallets = await createWallets();
    await enableAccountFlag(wallets.recipient, ASF_REQUIRE_DEST);
    const synced = await syncHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, iouAmount("1"));

    expect(status.errors.transaction?.name).toBe("XrpDestinationTagRequired");
  });
});
