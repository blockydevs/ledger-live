import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenType,
  TransactionId,
  TransferTransaction,
} from "@hashgraph/sdk";
import {
  GENESIS_ACCOUNT_ID,
  GENESIS_OPERATOR_KEY,
  LOCAL_CONSENSUS_NODES,
  LOCAL_MIRROR_NODE_URL,
} from "./fixtures";
import { deploySolo } from "./solo";

const MIRROR_NODE_POLL_TIMEOUT_MS = 30_000;
const MIRROR_NODE_POLL_INTERVAL_MS = 1_000;

let client: Client | undefined;

/** Genesis-operator client, memoised alongside the deployment it belongs to. */
export async function getGenesisClient(): Promise<Client> {
  if (!client) {
    await deploySolo();
    const created = Client.forNetwork(LOCAL_CONSENSUS_NODES, { scheduleNetworkUpdate: false });
    created.setOperator(GENESIS_ACCOUNT_ID, PrivateKey.fromStringED25519(GENESIS_OPERATOR_KEY));
    client = created;
  }
  return client;
}

export function closeGenesisClient(): void {
  client?.close();
  client = undefined;
}

async function pollMirrorNode(
  path: string,
  isReady: (body: any) => boolean,
  describeFailure: string,
): Promise<void> {
  const deadline = Date.now() + MIRROR_NODE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${LOCAL_MIRROR_NODE_URL}${path}`).catch(() => undefined);
    if (res?.ok && isReady(await res.json())) return;
    await new Promise(resolve => setTimeout(resolve, MIRROR_NODE_POLL_INTERVAL_MS));
  }
  throw new Error(`hedera genesis: ${describeFailure} within ${MIRROR_NODE_POLL_TIMEOUT_MS}ms`);
}

/** `evm_address` can be unset right after account creation; coin-hedera's `getAccountShape` throws hard on that. */
async function waitForMirrorNodeEvmAddress(accountId: string): Promise<void> {
  await pollMirrorNode(
    `/api/v1/accounts/${accountId}`,
    body => Boolean(body?.evm_address),
    `mirror node never populated evm_address for ${accountId}`,
  );
}

/** Waits for a token balance to be indexed; the runner's retry loop wraps only `expect`, not this. */
export async function waitForMirrorNodeTokenBalance(
  accountId: string,
  tokenId: string,
  atLeast: number,
): Promise<void> {
  await pollMirrorNode(
    `/api/v1/accounts/${accountId}/tokens`,
    body =>
      (body?.tokens ?? []).some(
        (t: { token_id: string; balance: number }) =>
          t.token_id === tokenId && t.balance >= atLeast,
      ),
    `mirror node never reported a balance of ${atLeast} for token ${tokenId} on ${accountId}`,
  );
}

/** The consensus node to stake to. Can't use the bridge's preload data: `sortValidators` reorders it. */
export async function getFirstNodeId(): Promise<number> {
  const res = await fetch(`${LOCAL_MIRROR_NODE_URL}/api/v1/network/nodes?limit=1&order=asc`);
  if (!res.ok) {
    throw new Error(`hedera genesis: mirror node /network/nodes returned ${res.status}`);
  }
  const nodeId = ((await res.json()) as { nodes?: { node_id: number }[] }).nodes?.[0]?.node_id;
  if (typeof nodeId !== "number") {
    throw new Error("hedera genesis: mirror node reported no consensus nodes to stake to");
  }
  return nodeId;
}

export async function createFundedAccount(
  publicKey: string,
  hbar: number,
  maxAutomaticTokenAssociations?: number,
): Promise<string> {
  const genesis = await getGenesisClient();

  const transaction = new AccountCreateTransaction()
    .setKeyWithoutAlias(PublicKey.fromString(publicKey))
    .setInitialBalance(new Hbar(hbar))
    .setTransactionId(TransactionId.generate(GENESIS_ACCOUNT_ID));

  if (maxAutomaticTokenAssociations && maxAutomaticTokenAssociations > 0) {
    transaction.setMaxAutomaticTokenAssociations(maxAutomaticTokenAssociations);
  }

  const receipt = await transaction.execute(genesis).then(response => response.getReceipt(genesis));

  const accountId = receipt.accountId?.toString();
  if (!accountId) {
    throw new Error("hedera genesis: AccountCreateTransaction receipt has no accountId");
  }

  await waitForMirrorNodeEvmAddress(accountId);
  return accountId;
}

export async function createHtsToken({
  decimals,
  symbol,
  initialSupply,
}: {
  decimals: number;
  symbol: string;
  initialSupply: number;
}): Promise<string> {
  const genesis = await getGenesisClient();
  const operatorKey = genesis.operatorPublicKey;
  if (!operatorKey) throw new Error("hedera genesis: client has no operator public key");

  const receipt = await new TokenCreateTransaction()
    .setTokenName("Ledger Live Test Token")
    .setTokenSymbol(symbol)
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(decimals)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(AccountId.fromString(GENESIS_ACCOUNT_ID))
    .setAdminKey(operatorKey)
    .setSupplyKey(operatorKey)
    .setTransactionId(TransactionId.generate(GENESIS_ACCOUNT_ID))
    .execute(genesis)
    .then(response => response.getReceipt(genesis));

  const tokenId = receipt.tokenId?.toString();
  if (!tokenId) {
    throw new Error("hedera genesis: TokenCreateTransaction receipt has no tokenId");
  }
  return tokenId;
}

/** Associates a *fixture* account with a token via its own key; the account under test associates through the bridge instead. */
export async function associateToken(
  accountId: string,
  key: PrivateKey,
  tokenId: string,
): Promise<void> {
  const genesis = await getGenesisClient();

  const signed = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenIds([TokenId.fromString(tokenId)])
    .setTransactionId(TransactionId.generate(GENESIS_ACCOUNT_ID))
    .freezeWith(genesis)
    .sign(key);

  await signed.execute(genesis).then(response => response.getReceipt(genesis));
}

/** Transfers fungible units from the treasury (0.0.2) to an already-associated account. */
export async function transferToken(
  tokenId: string,
  toAccountId: string,
  amount: number,
): Promise<void> {
  const genesis = await getGenesisClient();

  await new TransferTransaction()
    .addTokenTransfer(
      TokenId.fromString(tokenId),
      AccountId.fromString(GENESIS_ACCOUNT_ID),
      -amount,
    )
    .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(toAccountId), amount)
    .setTransactionId(TransactionId.generate(GENESIS_ACCOUNT_ID))
    .execute(genesis)
    .then(response => response.getReceipt(genesis));
}
