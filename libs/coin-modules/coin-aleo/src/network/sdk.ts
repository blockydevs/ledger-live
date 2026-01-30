import network from "@ledgerhq/live-network";

async function decryptRecord<T>(ciphertext: string, viewKey: string): Promise<T> {
  const res = await network<T>({
    method: "POST",
    url: "https://aleo-backend.api.live.ledger.com/network/mainnet/decrypt",
    data: { ciphertext, view_key: viewKey },
  });

  return res.data;
}

export const sdkClient = { decryptRecord };
