import { createSigner } from "@ledgerhq/live-common/families/multiversx/signer";
import type { MultiversXSigner } from "./signer";

/**
 * A stand-in for app-multiversx under the family's real generic-framework signer
 * (`families/multiversx/signer.ts`): it answers the APDUs that signer sends and records the device
 * commands in order, so a scenario can assert the handshake that precedes every signature. The
 * signature itself comes from the tester's local key.
 */
export type DeviceCommand = "setAddress" | `provideESDTInfo:${string}` | "sign";

const INS_GET_ADDRESS = 0x03;
const INS_SET_ADDRESS = 0x05;
const INS_SIGN_HASH_TX = 0x07;
const INS_PROVIDE_ESDT_INFO = 0x08;
const FIRST_CHUNK = 0x00;
const SW_OK = Buffer.from([0x90, 0x00]);

export function buildRecordingDevice(signer: MultiversXSigner) {
  const commands: DeviceCommand[] = [];
  let message = Buffer.alloc(0);

  const transport = {
    decorateAppAPIMethods: () => {},
    send: async (
      _cla: number,
      ins: number,
      p1: number,
      _p2: number,
      data: Buffer = Buffer.alloc(0),
    ): Promise<Buffer> => {
      switch (ins) {
        case INS_GET_ADDRESS: {
          const { address } = await signer.getAddress("");
          const encoded = Buffer.from(address, "ascii");
          return Buffer.concat([Buffer.from([encoded.length]), encoded, SW_OK]);
        }
        case INS_SET_ADDRESS:
          commands.push("setAddress");
          return SW_OK;
        case INS_PROVIDE_ESDT_INFO: {
          const tickerLength = data[0];
          commands.push(`provideESDTInfo:${data.subarray(1, 1 + tickerLength).toString()}`);
          return SW_OK;
        }
        case INS_SIGN_HASH_TX: {
          if (p1 === FIRST_CHUNK) {
            commands.push("sign");
            message = Buffer.from(data);
          } else {
            message = Buffer.concat([message, data]);
          }
          // The message arrives in chunks; only the last one completes the JSON to sign.
          try {
            JSON.parse(message.toString());
          } catch {
            return SW_OK;
          }
          const signature = await signer.signTransaction("", message.toString());
          return Buffer.concat([Buffer.from([64]), Buffer.from(signature, "hex"), SW_OK]);
        }
        default:
          throw new Error(`Unexpected app-multiversx instruction 0x${ins.toString(16)}`);
      }
    },
  };

  return {
    device: createSigner(transport as unknown as Parameters<typeof createSigner>[0]),
    /** The commands recorded since the last `clearCommands`. */
    readCommands: (): DeviceCommand[] => [...commands],
    clearCommands: () => {
      commands.length = 0;
    },
  };
}
