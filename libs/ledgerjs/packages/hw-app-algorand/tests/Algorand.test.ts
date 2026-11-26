import { openTransportReplayer, RecordStore } from "@ledgerhq/hw-transport-mocker";
import Algorand from "../src/Algorand";

test("Algorand init", async () => {
  const transport = await openTransportReplayer(RecordStore.fromString(""));
  const algo = new Algorand(transport);
  expect(algo).not.toBe(undefined);
});

test("sign returns the 0x6986 refusal status word as the signature", async () => {
  const transport = await openTransportReplayer(
    RecordStore.fromString(`
      => 800801000680000000abcd
      <= 6986
    `),
  );
  const signed = new Algorand(transport).sign("44'/283'/0'/0/0", "abcd");

  // A fix in Algorand.sign flips this to: await expect(signed).rejects.toThrow("UserRefusedOnDevice");
  await expect(signed).resolves.toEqual({ signature: Buffer.from("6986", "hex") });
});
