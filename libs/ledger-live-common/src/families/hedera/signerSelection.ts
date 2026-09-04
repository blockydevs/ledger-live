import type Transport from "@ledgerhq/hw-transport";
import { DmkSignerHedera, LegacySignerHedera } from "@ledgerhq/live-signer-hedera";
import type { HederaSigner } from "@ledgerhq/coin-hedera/types/index";
import { isDmkTransport } from "../../hw/dmkUtils";

let _hederaLdmkEnabled = false;

export const setHederaLdmkEnabled = (enabled: boolean): void => {
  _hederaLdmkEnabled = enabled;
};

export const createHederaSigner = (transport: Transport): HederaSigner => {
  if (isDmkTransport(transport) && _hederaLdmkEnabled) {
    return new DmkSignerHedera(transport.dmk, transport.sessionId);
  }
  return new LegacySignerHedera(transport);
};
