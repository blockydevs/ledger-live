import invariant from "invariant";
import type { DeviceManagementKit } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { DmkSignerHedera } from "@ledgerhq/live-signer-hedera";

export type TransportWithDmk = Transport &
  Partial<{
    dmk: DeviceManagementKit;
    sessionId: string;
  }>;

export const createDmkSigner = (transport: TransportWithDmk): DmkSignerHedera => {
  invariant(transport.dmk, "hedera: transport.dmk is missing");
  invariant(transport.sessionId, "hedera: transport.sessionId is missing");
  return new DmkSignerHedera(transport.dmk, transport.sessionId);
};
