import type { AccountBridge, CurrencyBridge } from "@ledgerhq/types-live";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import hederaCoinConfig from "@ledgerhq/coin-hedera/config";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import type { GetAddressFn } from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import { getCoinFrameworkAccountBridge } from "@ledgerhq/live-common/bridge/generic-coin-framework/accountBridge";
import { getCoinFrameworkCurrencyBridge } from "@ledgerhq/live-common/bridge/generic-coin-framework/currencyBridge";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import {
  deserializeTransaction,
  getHederaTransactionBodyBytes,
  serializeSignature,
} from "@ledgerhq/coin-hedera/logic/utils";
import type { TransactionStatus, HederaAccount, HederaSigner } from "@ledgerhq/coin-hedera/types";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import { registerCoinModules } from "@ledgerhq/live-common/coin-modules/registry";
import { coinModuleLoaders } from "@ledgerhq/live-common/coin-modules/loaders";
import { toGenericHederaTransaction } from "./canonicalTransaction";
import type { HederaBridgeTarget } from "./bridgeTarget";
import { buildLocalHederaConfig } from "./helpers";
import { HEDERA, installCryptoAssetsStore } from "./fixtures";
import { buildHederaSigner } from "./signer";
import { createFundedAccount } from "./genesis";
import { initMswHandlers } from "./indexer";

/** Every scenario account starts funded with this many HBAR from the genesis operator. */
const INITIAL_BALANCE_HBAR = 100;

registerCoinModules(coinModuleLoaders);

export async function getGenericBridges(signer: HederaSigner): Promise<{
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<GenericTransaction, HederaAccount, TransactionStatus>;
  getAddress: GetAddressFn;
}> {
  // The generic framework signs through the `families/hedera/signer.ts` shape — `getAddress(path)`
  // plus `signTransaction(path, rawTxHex)` — while the tester's software signer speaks the raw
  // device API. This adapter is `createSignerHedera` with the software key in place of a Transport.
  const coinSigner = {
    getAddress: async (path: string) => {
      const publicKey = await signer.getPublicKey(path);
      // Hedera has no on-device address computation; the public key doubles as the address.
      return { path, address: publicKey, publicKey };
    },
    signTransaction: async (path: string, rawTxHex: string) => {
      const tx = deserializeTransaction(rawTxHex);
      const bodyBytes = getHederaTransactionBodyBytes(tx);
      const signature = await signer.signTransaction(bodyBytes);
      return serializeSignature(signature);
    },
  };
  const signerContext: SignerContext<typeof coinSigner> = (_deviceId, fn) => fn(coinSigner);

  // The legacy `createBridges` takes the coin config as an argument. The generic framework reads
  // it back out of LiveConfig instead, through `families/hedera/coinModuleApi.ts`, so both stores
  // have to be primed before a bridge is built.
  const localConfig = buildLocalHederaConfig();
  hederaCoinConfig.setCoinConfig(() => localConfig);
  LiveConfig.setConfig({
    config_currency_hedera: {
      type: "object",
      default: localConfig,
    },
  });

  const getAddress: GetAddressFn = (deviceId, { path }) =>
    signerContext(deviceId, s => s.getAddress(path));
  const customSigner = { context: signerContext, getAddress };

  const [currencyBridge, accountBridge] = await Promise.all([
    getCoinFrameworkCurrencyBridge("hedera", "local", customSigner),
    getCoinFrameworkAccountBridge("hedera", "local", customSigner),
  ]);

  return { currencyBridge, accountBridge, getAddress };
}

export async function setupGenericHederaScenario(
  tokens: TokenCurrency[],
  maxAutomaticTokenAssociations?: number,
): Promise<{
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<GenericTransaction, HederaAccount, TransactionStatus>;
  publicKey: string;
  accountId: string;
  close: () => void;
}> {
  installCryptoAssetsStore(tokens);

  const signer = buildHederaSigner();
  const { currencyBridge, accountBridge, getAddress } = await getGenericBridges(signer);

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

/** Generic-framework staking positions carry `stakedNodeId` in `details`, a free-form map — read
 * it back with a type guard instead of trusting the framework's `Record<string, unknown>`. A
 * `stakedNodeId` of -1 is the mirror node's sentinel for "not delegated", matching how `hederaResources`
 * reads on the legacy side. */
export function getGenericStakingNodeId(account: HederaAccount): number | null {
  const stakedNodeId = account.stakingPositions?.[0]?.details?.stakedNodeId;
  return typeof stakedNodeId === "number" && stakedNodeId >= 0 ? stakedNodeId : null;
}

export const genericTarget: HederaBridgeTarget<GenericTransaction> = {
  setup: setupGenericHederaScenario,
  toTransaction: toGenericHederaTransaction,
  getStakingNodeId: getGenericStakingNodeId,
};
