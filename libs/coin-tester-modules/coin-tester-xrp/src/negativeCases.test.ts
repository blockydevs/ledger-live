import BigNumber from "bignumber.js";
import type { Account, AccountBridge, TransactionStatusCommon } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import { makeXrpAccount } from "./fixtures";
import { getBridges, createFundedWallet, setLocalXrpConfig, syncAccount } from "./helpers";
import {
  ASF_DEFAULT_RIPPLE,
  ASF_REQUIRE_DEST,
  authorizeMpt,
  createMptIssuance,
  enableAccountFlag,
  freezeTrustLine,
  issue,
  lockMpt,
  openTrustLine,
  setTransferRate,
  TF_MPT_CAN_LOCK,
  TF_MPT_CAN_TRANSFER,
} from "./local-tx";
import { getNextSequence, makeWallet, type XrplWallet } from "./rippled";
import { buildXrpSigner } from "./signer";
import { installTokenStore, toIouAmount, makeIouToken, makeMptToken } from "./tokens";

global.console = require("console");
jest.setTimeout(600_000);

type Wallets = { holder: XrplWallet; issuer: XrplWallet; recipient: XrplWallet };

type MptWallets = Wallets & { issuanceId: string };

type SyncedHolder = {
  accountBridge: AccountBridge<GenericTransaction>;
  account: Account;
  token: TokenCurrency;
  subAccountId: string;
  signTransaction: jest.SpyInstance;
};

/**
 * The holder holds 10 USD on a line with limit 1000. `recipientLimit` is the recipient's USD
 * limit, `null` for no line.
 */
async function createWallets(recipientLimit: string | null = "1000"): Promise<Wallets> {
  const holder = await createFundedWallet();
  const issuer = await createFundedWallet();
  const recipient = await createFundedWallet();
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

async function syncHolder(holder: XrplWallet, token: TokenCurrency): Promise<SyncedHolder> {
  installTokenStore([token]);
  setLocalXrpConfig(["iou", "mpt"]);

  const signer = buildXrpSigner(holder);
  const signTransaction = jest.spyOn(signer, "signTransaction");
  const { accountBridge } = await getBridges(signer);
  const account = await syncAccount(accountBridge, makeXrpAccount(holder.address));
  const subAccountId = encodeTokenAccountId(account.id, token);
  // Without the sub-account, the send would go out in XRP and a no-error case would pass for nothing.
  expect(account.subAccounts?.map(sub => sub.id)).toContain(subAccountId);

  return {
    accountBridge,
    account,
    token,
    subAccountId,
    signTransaction,
  };
}

function syncIouHolder({ holder, issuer }: Wallets): Promise<SyncedHolder> {
  return syncHolder(holder, makeIouToken("USD", issuer.address));
}

/**
 * The holder holds 1000 of an issuance with `flags` and asset scale 0. `isRecipientOptedIn` false
 * leaves the recipient without an MPToken.
 */
async function createMptWallets({
  flags = TF_MPT_CAN_TRANSFER,
  transferFee,
  isRecipientOptedIn = true,
}: {
  flags?: number;
  transferFee?: number;
  isRecipientOptedIn?: boolean;
} = {}): Promise<MptWallets> {
  const holder = await createFundedWallet();
  const issuer = await createFundedWallet();
  const recipient = await createFundedWallet();

  const issuanceId = await createMptIssuance(issuer, { flags, transferFee, assetScale: 0 });
  await authorizeMpt(holder, issuanceId);
  await issue(issuer, holder.address, { mpt_issuance_id: issuanceId, value: "1000" });
  if (isRecipientOptedIn) await authorizeMpt(recipient, issuanceId);

  return { holder, issuer, recipient, issuanceId };
}

function syncMptHolder({ holder, issuer, issuanceId }: MptWallets): Promise<SyncedHolder> {
  const token = makeMptToken({ issuanceId, issuer: issuer.address, ticker: "MPT", assetScale: 0 });

  return syncHolder(holder, token);
}

/** Also asserts that the status check signed nothing and put nothing on the ledger. */
async function getSendStatus(
  { accountBridge, account, token, subAccountId, signTransaction }: SyncedHolder,
  recipient: string,
  amount: BigNumber,
): Promise<TransactionStatusCommon> {
  const transaction = accountBridge.updateTransaction(accountBridge.createTransaction(account), {
    subAccountId,
    recipient,
    amount,
    assetReference: token.tokenIdentifier,
    assetOwner: token.contractAddress,
  });
  const sequenceBefore = await getNextSequence(account.freshAddress);
  const prepared = await accountBridge.prepareTransaction(account, transaction);
  const status = await accountBridge.getTransactionStatus(account, prepared);

  expect(signTransaction).not.toHaveBeenCalled();
  expect(await getNextSequence(account.freshAddress)).toBe(sequenceBefore);

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
    const synced = await syncIouHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, toIouAmount("1"));

    expect(status.errors.amount?.name).toBe("XrpTokenFrozen");
  });

  it("frozen line still pays the issuer", async () => {
    const wallets = await createWallets();
    await freezeTrustLine(wallets.issuer, { holder: wallets.holder.address, currency: "USD" });
    const synced = await syncIouHolder(wallets);

    const status = await getSendStatus(synced, wallets.issuer.address, toIouAmount("1"));

    expect(status.errors).toEqual({});
  });

  it("recipient without a trust line", async () => {
    const wallets = await createWallets(null);
    const synced = await syncIouHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, toIouAmount("1"));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });

  it("recipient limit below the amount", async () => {
    const wallets = await createWallets("5");
    const synced = await syncIouHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, toIouAmount("6"));

    expect(status.errors.amount?.name).toBe("XrpTokenAmountNotDeliverable");
  });

  it("amount plus transfer rate above balance", async () => {
    const wallets = await createWallets();
    await setTransferRate(wallets.issuer, 1_250_000_000);
    const synced = await syncIouHolder(wallets);

    // 9 USD under a 25 % rate debits 11.25 of the 10 held.
    const status = await getSendStatus(synced, wallets.recipient.address, toIouAmount("9"));

    expect(status.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("recipient account does not exist", async () => {
    const wallets = await createWallets();
    const synced = await syncIouHolder(wallets);

    const status = await getSendStatus(synced, makeWallet().address, toIouAmount("1"));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });

  it("recipient requires a destination tag", async () => {
    const wallets = await createWallets();
    await enableAccountFlag(wallets.recipient, ASF_REQUIRE_DEST);
    const synced = await syncIouHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, toIouAmount("1"));

    expect(status.errors.transaction?.name).toBe("XrpDestinationTagRequired");
  });
});

describe("XRP refused MPT sends", () => {
  let stopRemoteGuard: () => void;

  beforeAll(() => {
    stopRemoteGuard = forbidRemoteRequests();
  });

  afterAll(() => {
    stopRemoteGuard?.();
  });

  it("locked holder refuses the send", async () => {
    const wallets = await createMptWallets({ flags: TF_MPT_CAN_TRANSFER + TF_MPT_CAN_LOCK });
    const { issuer, holder, issuanceId } = wallets;
    await lockMpt(issuer, { holder: holder.address, issuanceId });
    const synced = await syncMptHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, new BigNumber(1));

    expect(status.errors.amount?.name).toBe("XrpTokenFrozen");
  });

  it("locked holder still pays the issuer", async () => {
    const wallets = await createMptWallets({ flags: TF_MPT_CAN_TRANSFER + TF_MPT_CAN_LOCK });
    const { issuer, holder, issuanceId } = wallets;
    await lockMpt(issuer, { holder: holder.address, issuanceId });
    const synced = await syncMptHolder(wallets);

    const status = await getSendStatus(synced, issuer.address, new BigNumber(1));

    expect(status.errors).toEqual({});
  });

  it("recipient without an MPToken", async () => {
    const wallets = await createMptWallets({ isRecipientOptedIn: false });
    const synced = await syncMptHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, new BigNumber(1));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });

  it("locked recipient", async () => {
    const wallets = await createMptWallets({ flags: TF_MPT_CAN_TRANSFER + TF_MPT_CAN_LOCK });
    const { issuer, recipient, issuanceId } = wallets;
    await lockMpt(issuer, { holder: recipient.address, issuanceId });
    const synced = await syncMptHolder(wallets);

    const status = await getSendStatus(synced, recipient.address, new BigNumber(1));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });

  it("amount plus transfer fee above balance", async () => {
    const wallets = await createMptWallets({ transferFee: 25_000 });
    const synced = await syncMptHolder(wallets);

    // 900 under a 25 % fee debits 1125 of the 1000 held.
    const status = await getSendStatus(synced, wallets.recipient.address, new BigNumber(900));

    expect(status.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("issuance without CanTransfer", async () => {
    const wallets = await createMptWallets({ flags: 0 });
    const synced = await syncMptHolder(wallets);

    const status = await getSendStatus(synced, wallets.recipient.address, new BigNumber(1));

    expect(status.errors.recipient?.name).toBe("XrpTokenCannotReceive");
  });
});
