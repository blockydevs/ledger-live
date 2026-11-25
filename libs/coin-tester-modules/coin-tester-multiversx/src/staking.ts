import { Address } from "@multiversx/sdk-core";
import { GAS_PRICE } from "@ledgerhq/coin-multiversx/constants";
import {
  SIMULATOR_URL,
  advanceToEpoch,
  generateBlocks,
  generateBlocksUntilTxProcessed,
  simulatorGet,
} from "./chainSimulator";
import type { MultiversXSigner } from "./signer";

const DELEGATION_MANAGER_SC = Address.newFromHex(
  "000000000000000000010000000000000000000000000000000000000004ffff",
).bech32();
/** The protocol minimum to open a staking provider. */
export const PROVIDER_CREATION_COST = 1_250_000_000_000_000_000_000n;
const CREATE_PROVIDER_GAS_LIMIT = 60_000_000;
const UNCAPPED = "";
const SERVICE_FEE_PERCENT_X100 = "03e8"; // 10.00%

interface GatewayAccount {
  data: { account: { nonce: number } };
}
interface GatewayConfig {
  data: { config: { erd_chain_id: string } };
}
interface GatewaySend {
  data?: { txHash?: string };
  error?: string;
}
interface GatewayTx {
  data: {
    transaction: {
      status: string;
      logs?: { events?: { identifier: string; address: string; topics?: string[] }[] };
    };
  };
}
interface GatewayVmQuery {
  data: {
    data: { returnData: (string | null)[] | null; returnCode: string; returnMessage: string };
  };
}

/** Sign `{receiver, value, data, gasLimit}` from `sender` and mine it. Returns the tx hash. */
async function sendSystemTransaction(
  signer: MultiversXSigner,
  sender: string,
  {
    receiver,
    value,
    data,
    gasLimit,
  }: { receiver: string; value: bigint; data: string; gasLimit: number },
): Promise<string> {
  const chainID = (await simulatorGet<GatewayConfig>("/network/config"))?.data.config.erd_chain_id;
  const nonce = (await simulatorGet<GatewayAccount>(`/address/${sender}`))?.data.account.nonce;
  const unsigned = {
    nonce: nonce ?? 0,
    value: value.toString(),
    receiver,
    sender,
    gasPrice: GAS_PRICE,
    gasLimit,
    data: Buffer.from(data).toString("base64"),
    chainID: chainID ?? "",
    version: 2,
    options: 1,
  };
  const signature = await signer.signTransaction("", JSON.stringify(unsigned));
  const sent = (await fetch(`${SIMULATOR_URL}/transaction/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...unsigned, signature }),
  }).then(r => r.json())) as GatewaySend;
  const txHash = sent.data?.txHash;
  if (!txHash) throw new Error(`Submit rejected: ${JSON.stringify(sent)}`);
  await generateBlocksUntilTxProcessed(txHash);
  await generateBlocks(2);
  return txHash;
}

/** Open an uncapped staking provider owned by `owner`. Returns the provider's contract address. */
export async function createDelegationProvider(
  owner: MultiversXSigner,
  ownerAddress: string,
): Promise<string> {
  const txHash = await sendSystemTransaction(owner, ownerAddress, {
    receiver: DELEGATION_MANAGER_SC,
    value: PROVIDER_CREATION_COST,
    data: ["createNewDelegationContract", UNCAPPED, SERVICE_FEE_PERCENT_X100].join("@"),
    gasLimit: CREATE_PROVIDER_GAS_LIMIT,
  });
  const tx = (await simulatorGet<GatewayTx>(`/transaction/${txHash}?withResults=true`))?.data
    .transaction;
  const deploy = tx?.logs?.events?.find(e => e.identifier === "SCDeploy");
  if (tx?.status !== "success" || !deploy) {
    throw new Error(`Provider creation failed: ${JSON.stringify(tx)}`);
  }
  return deploy.address;
}

/** Query a view of a provider contract; returns the raw base64 return values. */
export async function queryProvider(
  contract: string,
  funcName: string,
  args: string[] = [],
): Promise<string[]> {
  const res = (await fetch(`${SIMULATOR_URL}/vm-values/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scAddress: contract, funcName, args }),
  }).then(r => r.json())) as GatewayVmQuery;
  return (res.data?.data?.returnData ?? []).map(v => v ?? "");
}

/** Decode a base64 big-endian unsigned integer as returned by a VM query. */
export function decodeBigUint(base64: string | undefined): bigint {
  const hex = Buffer.from(base64 ?? "", "base64").toString("hex");
  return hex ? BigInt(`0x${hex}`) : 0n;
}

export const addressToHex = (address: string): string => Address.newFromBech32(address).toHex();

interface GatewayNetworkStatus {
  data: { status: { erd_epoch_number: number } };
}

/**
 * Advance epoch by epoch until `address` can withdraw what it undelegated from `contract`. The
 * unbonding period is protocol configuration, so the loop reads it off the contract instead.
 */
export async function advanceUntilUnbondable(address: string, contract: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const [unBondable] = await queryProvider(contract, "getUserUnBondable", [
      addressToHex(address),
    ]);
    if (decodeBigUint(unBondable) > 0n) return;
    const status = await simulatorGet<GatewayNetworkStatus>("/network/status/4294967295");
    await advanceToEpoch((status?.data.status.erd_epoch_number ?? 0) + 1);
  }
  throw new Error(`Nothing unbondable for ${address} at ${contract} after 20 epochs`);
}
