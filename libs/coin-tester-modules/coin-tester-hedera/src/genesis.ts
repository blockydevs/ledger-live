import {
  AccountCreateTransaction,
  AccountId,
  Client,
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
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
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
} from "./fixtures";
import { deploySolo } from "./solo";
import erc20Artifact from "./fixtures/LedgerLiveTestToken.json";

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

/** `T` is the caller's assertion about the mirror-node payload, as in `getFirstNodeId` below. */
async function pollMirrorNode<T>(
  path: string,
  isReady: (body: T) => boolean,
  describeFailure: string,
  init?: RequestInit,
): Promise<void> {
  const deadline = Date.now() + MIRROR_NODE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${LOCAL_MIRROR_NODE_URL}${path}`, init).catch(() => undefined);
    if (res?.ok && isReady((await res.json()) as T)) return;
    await new Promise(resolve => setTimeout(resolve, MIRROR_NODE_POLL_INTERVAL_MS));
  }
  throw new Error(`hedera genesis: ${describeFailure} within ${MIRROR_NODE_POLL_TIMEOUT_MS}ms`);
}

/**
 * `evm_address` can be unset right after account creation; coin-hedera's `getAccountShape` throws
 * hard on that. Returns the address so callers (e.g. the ERC20 scenario, which needs it to seed
 * the account under test via a raw `transferErc20`) don't have to re-fetch it themselves.
 */
export async function waitForMirrorNodeEvmAddress(accountId: string): Promise<string> {
  let evmAddress: string | undefined;
  await pollMirrorNode<{ evm_address?: string }>(
    `/api/v1/accounts/${accountId}`,
    body => {
      evmAddress = body?.evm_address;
      return Boolean(evmAddress);
    },
    `mirror node never populated evm_address for ${accountId}`,
  );
  return evmAddress!;
}

/** Waits for a token balance to be indexed; the runner's retry loop wraps only `expect`, not this. */
export async function waitForMirrorNodeTokenBalance(
  accountId: string,
  tokenId: string,
  atLeast: number,
): Promise<void> {
  await pollMirrorNode<{ tokens?: { token_id: string; balance: number }[] }>(
    `/api/v1/accounts/${accountId}/tokens`,
    body => (body?.tokens ?? []).some(t => t.token_id === tokenId && t.balance >= atLeast),
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

// Deploy needs ~330-362k gas; 300,000 fails with INSUFFICIENT_GAS. Headroom is free here since
// Solo's genesis account holds ~50B HBAR.
const ERC20_DEPLOY_GAS = 1_000_000;
const ERC20_CALL_GAS = 100_000;
const ERC20_INITIAL_SUPPLY = 1_000_000;

/** `keccak256("balanceOf(address)")[:4]` — the standard ERC20 selector, stable across compilers. */
const BALANCE_OF_SELECTOR = "70a08231";

function encodeBalanceOfCall(accountEvmAddress: string): string {
  const address = accountEvmAddress.replace(/^0x/, "").toLowerCase();
  return `0x${BALANCE_OF_SELECTOR}${address.padStart(64, "0")}`;
}

/** Deploys the fixture ERC20 (see `fixtures/LedgerLiveTestToken.json`), minting the whole supply to the genesis operator. */
export async function deployErc20Token(): Promise<{ contractId: string; evmAddress: string }> {
  const genesis = await getGenesisClient();

  const constructorParameters = new ContractFunctionParameters()
    .addString("Ledger Live Test Token")
    .addString(TOKEN_SYMBOL)
    .addUint8(TOKEN_DECIMALS)
    .addUint256(ERC20_INITIAL_SUPPLY);

  const receipt = await new ContractCreateFlow()
    .setBytecode(erc20Artifact.bytecode)
    .setGas(ERC20_DEPLOY_GAS)
    .setConstructorParameters(constructorParameters)
    .execute(genesis)
    .then(response => response.getReceipt(genesis));

  const contractId = receipt.contractId?.toString();
  if (!contractId) {
    throw new Error("hedera genesis: ContractCreateFlow receipt has no contractId");
  }

  let evmAddress: string | undefined;
  await pollMirrorNode<{ evm_address?: string }>(
    `/api/v1/contracts/${contractId}`,
    body => {
      evmAddress = body?.evm_address;
      return Boolean(evmAddress);
    },
    `mirror node never populated evm_address for contract ${contractId}`,
  );

  return { contractId, evmAddress: evmAddress! };
}

/** Transfers ERC20 units from the genesis operator (the mint recipient) to `toEvmAddress`. */
export async function transferErc20(
  evmAddress: string,
  toEvmAddress: string,
  amount: number,
): Promise<void> {
  const genesis = await getGenesisClient();

  await new ContractExecuteTransaction()
    .setContractId(ContractId.fromEvmAddress(0, 0, evmAddress))
    .setGas(ERC20_CALL_GAS)
    .setFunction(
      "transfer",
      new ContractFunctionParameters().addAddress(toEvmAddress).addUint256(amount),
    )
    .setTransactionId(TransactionId.generate(GENESIS_ACCOUNT_ID))
    .execute(genesis)
    .then(response => response.getReceipt(genesis));
}

/** Polls `balanceOf` via the same mirror-node `contracts/call` endpoint the hgraph fake reads from. */
export async function waitForErc20Balance(
  evmAddress: string,
  accountEvmAddress: string,
  expected: number,
): Promise<void> {
  await pollMirrorNode<{ result?: string }>(
    "/api/v1/contracts/call",
    body => typeof body?.result === "string" && BigInt(body.result) >= BigInt(expected),
    `mirror node never reported a balance of ${expected} for ${accountEvmAddress} on contract ${evmAddress}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        block: "latest",
        to: evmAddress,
        data: encodeBalanceOfCall(accountEvmAddress),
      }),
    },
  );
}
