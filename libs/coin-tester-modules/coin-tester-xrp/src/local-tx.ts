import { signAndSubmit, type XrplWallet } from "./rippled";

/**
 * Issuer-side and holder-side transactions that set up the ledger state the scenarios start from.
 * They sign in-process and go straight to rippled, not through coin-xrp, so a coin-xrp failure
 * cannot hide behind a set-up step.
 */

/** XRPL flags combine with `+`: `|` turns a value with bit 31 set into a negative number. */
const TF_SET_NO_RIPPLE = 0x00020000;
const TF_SET_FREEZE = 0x00100000;

export const ASF_REQUIRE_DEST = 1;
export const ASF_DEFAULT_RIPPLE = 8;
export const ASF_ALLOW_TRUSTLINE_CLAWBACK = 16;

export const TF_MPT_CAN_LOCK = 0x00000002;
export const TF_MPT_CAN_TRANSFER = 0x00000020;
export const TF_MPT_CAN_CLAWBACK = 0x00000040;
const TF_MPT_LOCK = 0x00000001;
const TF_MPT_UNAUTHORIZE = 0x00000001;

type IouAmount = { currency: string; issuer: string; value: string };
type MptAmount = { mpt_issuance_id: string; value: string };

/** The holder opens a trust line to `issuer` for `currency`, up to `limit` whole units. */
export async function openTrustLine(
  holder: XrplWallet,
  { currency, issuer, limit }: { currency: string; issuer: string; limit: string },
): Promise<void> {
  await signAndSubmit(holder, {
    TransactionType: "TrustSet",
    LimitAmount: { currency, issuer, value: limit },
    Flags: TF_SET_NO_RIPPLE,
  });
}

/** The holder sets its limit back to 0, as Ledger Live's opt-out does. A line at 0 balance is deleted. */
export async function closeTrustLine(
  holder: XrplWallet,
  { currency, issuer }: { currency: string; issuer: string },
): Promise<void> {
  await openTrustLine(holder, { currency, issuer, limit: "0" });
}

export async function enableAccountFlag(wallet: XrplWallet, flag: number): Promise<void> {
  await signAndSubmit(wallet, { TransactionType: "AccountSet", SetFlag: flag });
}

/** `transferRate` is in billionths: 1_250_000_000 charges 25 % on each holder-to-holder transfer. */
export async function setTransferRate(issuer: XrplWallet, transferRate: number): Promise<void> {
  await signAndSubmit(issuer, { TransactionType: "AccountSet", TransferRate: transferRate });
}

/** Needs `ASF_ALLOW_TRUSTLINE_CLAWBACK`, set before any trust line to the issuer exists. */
export async function clawbackIou(
  issuer: XrplWallet,
  { holder, currency, value }: { holder: string; currency: string; value: string },
): Promise<void> {
  await signAndSubmit(issuer, {
    TransactionType: "Clawback",
    // In a Clawback, `Amount.issuer` is the holder.
    Amount: { currency, issuer: holder, value },
  });
}

export async function freezeTrustLine(
  issuer: XrplWallet,
  { holder, currency }: { holder: string; currency: string },
): Promise<void> {
  await signAndSubmit(issuer, {
    TransactionType: "TrustSet",
    LimitAmount: { currency, issuer: holder, value: "0" },
    Flags: TF_SET_FREEZE,
  });
}

/** The issuer pays `amount` of its own IOU or MPT to `destination`. */
export async function issue(
  issuer: XrplWallet,
  destination: string,
  amount: IouAmount | MptAmount,
): Promise<void> {
  await signAndSubmit(issuer, {
    TransactionType: "Payment",
    Destination: destination,
    Amount: amount,
  });
}

/**
 * Creates an MPT issuance and returns its id. `transferFee` is in units of 0.001 %
 * and needs `TF_MPT_CAN_TRANSFER` in `flags`.
 */
export async function createMptIssuance(
  issuer: XrplWallet,
  { assetScale, flags, transferFee }: { assetScale: number; flags: number; transferFee?: number },
): Promise<string> {
  const { meta } = await signAndSubmit(issuer, {
    TransactionType: "MPTokenIssuanceCreate",
    AssetScale: assetScale,
    Flags: flags,
    ...(transferFee === undefined ? {} : { TransferFee: transferFee }),
  });
  const issuanceId = meta.mpt_issuance_id;
  if (typeof issuanceId !== "string") {
    throw new Error("MPTokenIssuanceCreate metadata has no mpt_issuance_id");
  }

  return issuanceId;
}

/** The holder opts in to an MPT issuance (creates its MPToken). */
export async function authorizeMpt(holder: XrplWallet, issuanceId: string): Promise<void> {
  await signAndSubmit(holder, {
    TransactionType: "MPTokenAuthorize",
    MPTokenIssuanceID: issuanceId,
  });
}

/** The holder opts out, as Ledger Live's opt-out does. Its MPToken must hold 0. */
export async function unauthorizeMpt(holder: XrplWallet, issuanceId: string): Promise<void> {
  await signAndSubmit(holder, {
    TransactionType: "MPTokenAuthorize",
    MPTokenIssuanceID: issuanceId,
    Flags: TF_MPT_UNAUTHORIZE,
  });
}

/** Needs `TF_MPT_CAN_LOCK` on the issuance. */
export async function lockMpt(
  issuer: XrplWallet,
  { holder, issuanceId }: { holder: string; issuanceId: string },
): Promise<void> {
  await signAndSubmit(issuer, {
    TransactionType: "MPTokenIssuanceSet",
    MPTokenIssuanceID: issuanceId,
    Holder: holder,
    Flags: TF_MPT_LOCK,
  });
}

/** Needs `TF_MPT_CAN_CLAWBACK` on the issuance. `value` is in base units. */
export async function clawbackMpt(
  issuer: XrplWallet,
  { holder, issuanceId, value }: { holder: string; issuanceId: string; value: string },
): Promise<void> {
  await signAndSubmit(issuer, {
    TransactionType: "Clawback",
    Amount: { mpt_issuance_id: issuanceId, value },
    Holder: holder,
  });
}
