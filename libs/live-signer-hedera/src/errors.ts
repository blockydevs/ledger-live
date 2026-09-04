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
