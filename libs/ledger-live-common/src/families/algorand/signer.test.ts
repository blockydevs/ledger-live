import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { combine } from "@ledgerhq/coin-algorand/logic/combine";
import { craftTransaction } from "@ledgerhq/coin-algorand/logic/craftTransaction";
import { getTransactionParams } from "@ledgerhq/coin-algorand/network";
import type Transport from "@ledgerhq/hw-transport";
import { UserRefusedOnDevice } from "@ledgerhq/ledger-wallet-framework/errors";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import algorandResolver from "@ledgerhq/coin-algorand/hw-getAddress";
import { createSigner } from "./signer";

jest.mock("@ledgerhq/coin-algorand/network", () => ({
  ...jest.requireActual("@ledgerhq/coin-algorand/network"),
  getTransactionParams: jest.fn(),
}));

const INS_GET_PUBLIC_KEY = 0x03;
const PATH = "44'/283'/0'/0/0";
const SENDER = "ZC3HFULMJF53BF5ER4E2TTGPBRGH2Y4RVS32JZ6NH4RW7LN67HCE6UBS3Q";
const RECIPIENT = "MECOWMKPKH2NWVZTS5V5RQDGFFYBT25KNLOPHG2KUMMNKU6FOHGJT24WBI";
const SW_OK = Buffer.from([0x90, 0x00]);
const SW_CANCEL = Buffer.from([0x69, 0x86]);

function makeTransport(signature = Buffer.concat([Buffer.alloc(64, 2), SW_OK])) {
  const send = jest.fn(async (_cla: number, ins: number) => {
    return ins === INS_GET_PUBLIC_KEY ? Buffer.concat([Buffer.alloc(32, 1), SW_OK]) : signature;
  });
  const transport = { send, decorateAppAPIMethods: jest.fn() } as unknown as Transport;
  return { transport, send };
}

function getP1Values(send: jest.Mock, ins: number): number[] {
  return send.mock.calls.filter(([, callIns]) => callIns === ins).map(([, , p1]) => p1);
}

async function craftUnsignedPayment(): Promise<string> {
  jest.mocked(getTransactionParams).mockResolvedValue({
    fee: 0,
    minFee: 1000,
    firstRound: 1000,
    lastRound: 1000,
    genesisHash: "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
    genesisID: "mainnet-v1.0",
  });
  const { serializedTransaction } = await craftTransaction(
    { node: "", indexer: "" } as Parameters<typeof craftTransaction>[0],
    { sender: SENDER, recipient: RECIPIENT, amount: 1000n },
  );
  return serializedTransaction;
}

describe("Algorand coin framework signer", () => {
  it("does not ask the device to confirm the address while signing", async () => {
    const { transport, send } = makeTransport();

    await createSigner(transport).getAddress(PATH, { derivationMode: "" });

    expect(getP1Values(send, INS_GET_PUBLIC_KEY)).toEqual([0x00]);
  });

  it("asks the device to confirm the address on receive", async () => {
    const { transport, send } = makeTransport();
    const context: SignerContext<ReturnType<typeof createSigner>> = (_deviceId, fn) =>
      fn(createSigner(transport));

    await algorandResolver(context)("deviceId", {
      path: PATH,
      verify: true,
      currency: getCryptoCurrencyById("algorand"),
      derivationMode: "",
    });

    expect(getP1Values(send, INS_GET_PUBLIC_KEY)).toEqual([0x80]);
  });

  it("rejects with UserRefusedOnDevice when the user refuses the transaction", async () => {
    const { transport } = makeTransport(SW_CANCEL);

    await expect(createSigner(transport).signTransaction(PATH, "abcd")).rejects.toThrow(
      UserRefusedOnDevice,
    );
  });

  it("returns a hex signature that combines with the unsigned transaction", async () => {
    const unsigned = await craftUnsignedPayment();
    const { transport } = makeTransport();

    const signature = await createSigner(transport).signTransaction(PATH, unsigned);

    expect(signature).toMatch(/^[0-9a-f]+$/i);
    expect(combine(unsigned, [signature])).toMatch(/^[0-9a-f]+$/i);
  });
});
