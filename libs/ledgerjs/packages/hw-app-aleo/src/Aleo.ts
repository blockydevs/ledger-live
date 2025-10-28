import { UserRefusedAddress } from "@ledgerhq/errors";
import type Transport from "@ledgerhq/hw-transport";

import BIPPath from "bip32-path";

const CLA = 0xe0;

const INS = {
  GET_PUBLIC_KEY: 0x05,
  SIGN_TRANSACTION: 0x04,
};

const STATUS = {
  OK: 0x9000,
  USER_CANCEL: 0x6985,
};
// FIXME:

export default class Aleo {
  transport: Transport;

  constructor(transport: Transport, scrambleKey = "MYC") {
    this.transport = transport;

    transport.decorateAppAPIMethods(this, ["getAddress", "signTransaction"], scrambleKey);
  }

  async getAddress(path: string, _display?: boolean): Promise<Buffer> {
    console.log(path);
    // Implement the logic to return the address as a Buffer
    return Buffer.from("example-address");
  }

  async getPublicKey(path: string, _display?: boolean): Promise<Buffer> {
    console.log("getPublicKey called with path:", path, "display:", _display);
    // const bipPath = BIPPath.fromString(path).toPathArray();
    // const bipPath = BIPPath.fromString(path).toPathArray();
    // console.log(bipPath);
    // const serializedPath = Buffer.from(bipPath);

    const pathBuffer = pathToBuffer(path);

    // const serializedPath = this._serializePath(bipPath);

    // Tworzymy bufor o odpowiednim rozmiarze
    // const headerBuffer = Buffer.alloc(1 + bipPath.length * 4);

    // Łączymy oba bufory
    // const combinedBuffer = Buffer.concat([headerBuffer, serializedPath]);

    const p1 = 0x01;
    const p2 = 0x00;

    // const payload = Buffer.concat([
    //   Buffer.from([CLA, INS.GET_PUBLIC_KEY, p1, p2]),
    //   Buffer.from([bipPath.length]),
    //   serializedPath,
    // ]);

    const response = await this.transport.send(CLA, INS.GET_PUBLIC_KEY, p1, p2, pathBuffer);

    console.log(response);

    const returnCodeBytes = response.slice(-2);
    const returnCode = (returnCodeBytes[0] << 8) | returnCodeBytes[1];

    if (returnCode === STATUS.USER_CANCEL) {
      throw new UserRefusedAddress();
    }
    return response;
  }

  async signTransaction(_path: string, _transaction: Buffer): Promise<Buffer> {
    console.log("signTransaction called with path:", _path, "transaction:", _transaction);
    throw new Error("TODO: not implemented signTransaction");
  }

  /**
   * Serialize a BIP path to a data buffer, intended for
   * consumption by the Hedera BOLOS.
   *
   * @private
   */
  _serializePath(path: number[]): Buffer {
    const data = Buffer.alloc(1 + path.length * 4);

    path.forEach((segment, index) => {
      data.writeUInt32BE(segment, 1 + index * 4);
    });

    return data;
  }
}

const pathToBuffer = (originalPath: string) => {
  const path = originalPath
    .split("/")
    .map(value => (value.endsWith("'") || value.endsWith("h") ? value : `${value}'`))
    .join("/");
  const pathNums: number[] = BIPPath.fromString(path).toPathArray();
  return serializePath(pathNums);
};

const serializePath = (path: number[]) => {
  const buf = Buffer.alloc(1 + path.length * 4);
  buf.writeUInt8(path.length, 0);
  for (const [i, num] of path.entries()) {
    buf.writeUInt32BE(num, 1 + i * 4);
  }
  return buf;
};
