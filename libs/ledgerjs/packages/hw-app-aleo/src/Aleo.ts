import type Transport from "@ledgerhq/hw-transport";

/** Hedera BOLOS API */
// TODO:
export default class Aleo {
  transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async getPublicKey(_path: string, _display?: boolean): Promise<Buffer> {
    throw new Error("TODO: not implemented");
  }

  async signTransaction(_ath: string, _transaction: Buffer): Promise<Buffer> {
    throw new Error("TODO: not implemented");
  }
}
