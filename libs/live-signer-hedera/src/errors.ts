/**
 * Input the signer kit rejects before anything reaches the device: an empty
 * transaction, a body that does not fit one APDU, or a derivation path the
 * device app cannot derive.
 */
export class HederaInvalidSignerInputError extends Error {
  override name = "HederaInvalidSignerInputError";
  constructor(message?: string) {
    super(message || "HederaInvalidSignerInputError");
  }
}

/**
 * Matches the legacy path's error name so both signers render the same title.
 * `name` is a plain string comparison in the app's error-to-title mapping, so
 * this class does not need to be the same constructor as the legacy one.
 */
export class TransactionRefusedOnDevice extends Error {
  override name = "TransactionRefusedOnDevice";
  constructor(message?: string) {
    super(message || "TransactionRefusedOnDevice");
  }
}
