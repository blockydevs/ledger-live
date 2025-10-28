import type Transport from "@ledgerhq/hw-transport";

// FIXME:
export default class Aleo {
  transport: Transport;

  constructor(transport: Transport, scrambleKey = "MYC") {
    this.transport = transport;

    transport.decorateAppAPIMethods(this, ["getAddress", "signTransaction"], scrambleKey);
  }

  async getPublicKey(_path: string, _display?: boolean): Promise<Buffer> {
    console.log("getPublicKey called with path:", _path, "display:", _display);
    throw new Error("TODO: not implemented");
  }

  async signTransaction(_path: string, _transaction: Buffer): Promise<Buffer> {
    console.log("signTransaction called with path:", _path, "transaction:", _transaction);
    throw new Error("TODO: not implemented");
  }
}
