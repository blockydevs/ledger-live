import { signAndSubmit, type XrplWallet } from "./rippled";

/**
 * Issuer-side and holder-side transactions that set up the ledger state the scenarios start from.
 * They sign in-process and go straight to rippled, not through coin-xrp, so a coin-xrp failure
 * cannot hide behind a set-up step.
 */

/** XRPL flags combine with `+`: `|` turns a value with bit 31 set into a negative number. */
export const TF_SET_NO_RIPPLE = 0x00020000;

export const TF_MPT_CAN_LOCK = 0x00000002;
export const TF_MPT_CAN_TRANSFER = 0x00000020;
export const TF_MPT_CAN_CLAWBACK = 0x00000040;

export type IouAmount = { currency: string; issuer: string; value: string };
export type MptAmount = { mpt_issuance_id: string; value: string };

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
