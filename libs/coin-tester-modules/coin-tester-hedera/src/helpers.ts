import type { AccountBridge, CurrencyBridge, TokenAccount } from "@ledgerhq/types-live";
import type { GetAddressFn } from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import { createBridges } from "@ledgerhq/coin-hedera/bridge/index";
import type { HederaCoinConfig } from "@ledgerhq/coin-hedera/config";
import hederaResolver from "@ledgerhq/coin-hedera/signer/index";
import type {
  Transaction,
  TransactionStatus,
  HederaAccount,
  HederaSigner,
} from "@ledgerhq/coin-hedera/types";
import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { registerCoinModules } from "@ledgerhq/live-common/coin-modules/registry";
import { coinModuleLoaders } from "@ledgerhq/live-common/coin-modules/loaders";
import { toLegacyTransaction } from "./canonicalTransaction";
import type { HederaBridgeTarget } from "./bridgeTarget";
import {
  FAKE_HGRAPH_URL,
  HEDERA,
  LOCAL_CONSENSUS_NODES,
  LOCAL_MIRROR_NODE_URL,
  installCryptoAssetsStore,
} from "./fixtures";
import { buildHederaSigner } from "./signer";
import { createFundedAccount } from "./genesis";
import { initMswHandlers } from "./indexer";

/** Every scenario account starts funded with this many HBAR from the genesis operator. */
const INITIAL_BALANCE_HBAR = 100;

type ScenarioSetupResult = Awaited<ReturnType<Scenario<Transaction, HederaAccount>["setup"]>>;

/** Absorbs the mirror node's lag behind consensus — for `expect` only, nothing earlier. */
export const SCENARIO_RETRY_POLICY: Pick<ScenarioSetupResult, "retryInterval" | "retryLimit"> = {
  retryInterval: 2000,
  retryLimit: 20,
};

/** Finds the sub-account for a given token id, however the caller has that token at hand. */
export function findTokenSubAccount(
  account: HederaAccount,
  tokenId: string,
): TokenAccount | undefined {
  return account.subAccounts?.find(sa => sa.type === "TokenAccount" && sa.token.id === tokenId) as
    | TokenAccount
    | undefined;
}

registerCoinModules(coinModuleLoaders);

// `networkType: "testnet"` is a label only — `consensusNodes` and `apiUrls` override the actual endpoints.
export function buildLocalHederaConfig(): HederaCoinConfig {
  return {
    status: { type: "active" },
    useNetworkTimestamp: false,
    networkType: "testnet",
    consensusNodes: LOCAL_CONSENSUS_NODES,
    apiUrls: {
      mirrorNode: LOCAL_MIRROR_NODE_URL,
      hgraph: FAKE_HGRAPH_URL,
    },
  };
}

export async function getBridges(signer: HederaSigner): Promise<{
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>;
  getAddress: GetAddressFn;
}> {
  const signerContext: SignerContext<HederaSigner> = (_deviceId, fn) => fn(signer);
  const localConfig = buildLocalHederaConfig();

  const { currencyBridge, accountBridge } = createBridges(signerContext, () => localConfig);
  const getAddress = hederaResolver(signerContext);

  return { currencyBridge, accountBridge, getAddress };
}

export async function setupHederaScenario(
  tokens: TokenCurrency[],
  maxAutomaticTokenAssociations?: number,
): Promise<{
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>;
  publicKey: string;
  accountId: string;
  close: () => void;
}> {
  installCryptoAssetsStore(tokens);

  const signer = buildHederaSigner();
  const { currencyBridge, accountBridge, getAddress } = await getBridges(signer);

  const { publicKey } = await getAddress("", {
    path: "44/3030",
    currency: HEDERA,
    derivationMode: "hederaBip44",
  });

  const close = initMswHandlers();

  const accountId = await createFundedAccount(
    publicKey,
    INITIAL_BALANCE_HBAR,
    maxAutomaticTokenAssociations,
  );

  return { currencyBridge, accountBridge, publicKey, accountId, close };
}

/** Legacy delegation state lives on `hederaResources`, not `stakingPositions`. */
export function getLegacyStakingNodeId(account: HederaAccount): number | null {
  return account.hederaResources?.delegation?.nodeId ?? null;
}

export const legacyTarget: HederaBridgeTarget<Transaction> = {
  setup: setupHederaScenario,
  toTransaction: toLegacyTransaction,
  getStakingNodeId: getLegacyStakingNodeId,
};
