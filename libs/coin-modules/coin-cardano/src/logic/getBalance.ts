import type {
  AssetInfo,
  Balance,
  Stake,
  StakeAction,
  StakeState,
} from "@ledgerhq/coin-module-framework/api/index";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { utils as TyphonUtils, types as TyphonTypes } from "@stricahq/typhonjs";
import BigNumber from "bignumber.js";
import { APITransaction } from "../api/api-types";
import { getDelegationInfo } from "../api/getDelegationInfo";
import { fetchNetworkInfo } from "../api/getNetworkInfo";
import { fetchAllTransactionsByPaymentKey } from "../api/getTransactionsByPaymentKey";
import { CARDANO_MAX_SUPPLY } from "../constants";
import {
  EMPTY_CREDENTIAL_KEY,
  extractPaymentKeyFromAddress,
  extractStakeKeyFromAddress,
  isByronAddress,
  mergeTokens,
} from "../logic";
import { CardanoDelegation } from "../types";

const NATIVE_ASSET: AssetInfo = { type: "native", name: "ADA" };

type AddressUtxo = { amount: BigNumber; tokens: TyphonTypes.Token[] };

/**
 * Derive the unspent outputs held by a single payment credential from its transaction
 * history: outputs paying that credential, minus those later consumed as inputs.
 *
 * Per-address only — a Cardano account spreads funds across many payment credentials
 * (derived from the xpub), but the CoinModule API receives a single address with no
 * xpub, so this covers just the passed address. See module-level note in getBalance.
 */
function computeUtxosForPaymentKey(
  transactions: APITransaction[],
  paymentKey: string,
): AddressUtxo[] {
  const spent = new Set<string>();
  for (const tx of transactions) {
    for (const input of tx.inputs) {
      if (input.paymentKey === paymentKey) spent.add(`${input.txId}#${input.index}`);
    }
  }

  const utxos: AddressUtxo[] = [];
  for (const tx of transactions) {
    tx.outputs.forEach((output, index) => {
      if (output.paymentKey !== paymentKey) return;
      if (spent.has(`${tx.hash}#${index}`)) return;
      utxos.push({
        amount: new BigNumber(output.value),
        tokens: output.tokens.map(t => ({
          policyId: t.policyId,
          assetName: t.assetName,
          amount: new BigNumber(t.value),
        })),
      });
    });
  }
  return utxos;
}

async function computeMinAdaForTokens(
  currency: CryptoCurrency,
  address: string,
  tokens: TyphonTypes.Token[],
): Promise<BigNumber> {
  const { protocolParams } = await fetchNetworkInfo(currency);
  return TyphonUtils.calculateMinUtxoAmountBabbage(
    {
      address: TyphonUtils.getAddressFromString(address),
      amount: new BigNumber(CARDANO_MAX_SUPPLY),
      tokens,
    },
    new BigNumber(protocolParams.utxoCostPerByte),
  );
}

/**
 * Map a Cardano delegation to a framework {@link Stake}. Cardano delegation locks no
 * principal (the whole balance is delegated implicitly), so the only concrete amounts
 * are the stake-key deposit and the claimable rewards — modelled as amountDeposited /
 * amountRewarded respectively. Returns undefined when there is no staking position.
 */
function buildStake(
  address: string,
  stakeKey: string | undefined,
  delegation: CardanoDelegation | undefined,
): Stake | undefined {
  if (!stakeKey || !delegation) return undefined;

  const rewards = delegation.rewards ?? new BigNumber(0);
  if (!delegation.status && rewards.lte(0)) return undefined;

  const amountDeposited = BigInt(new BigNumber(delegation.deposit || 0).toFixed());
  const amountRewarded = BigInt(rewards.toFixed());
  const state: StakeState = delegation.status ? "active" : "inactive";
  // Rewards can only be withdrawn once the account is delegated to a dRep (Conway rule;
  // the tx builder refuses a withdrawal otherwise). Don't advertise an action that can't
  // succeed today.
  const actions: StakeAction[] = amountRewarded > 0n && delegation.dRepHex ? ["claim_reward"] : [];

  const details: Record<string, unknown> = {};
  if (delegation.ticker) details.ticker = delegation.ticker;
  if (delegation.name) details.name = delegation.name;
  if (delegation.dRepHex) details.dRepHex = delegation.dRepHex;

  const stake: Stake = {
    uid: stakeKey,
    address,
    state,
    asset: NATIVE_ASSET,
    amount: amountDeposited + amountRewarded,
    amountDeposited,
    amountRewarded,
    actions,
  };
  if (delegation.poolId) stake.delegate = delegation.poolId;
  if (Object.keys(details).length > 0) stake.details = details;
  return stake;
}

/**
 * Balances held by a Cardano address: native ADA + each token from its UTXOs, plus the
 * account's staking position (when delegated) as a separate native balance entry.
 *
 * Caveat: native/token totals cover only the payment credential of the passed address.
 * A Cardano account holds funds across many addresses (derived from its xpub), which the
 * single-address CoinModule contract cannot enumerate. Staking is account-complete (the
 * stake credential is shared across all the account's addresses).
 */
export async function getBalance(currency: CryptoCurrency, address: string): Promise<Balance[]> {
  // Byron addresses are valid (isValidAddress accepts them) but expose no Shelley payment
  // credential, so we cannot derive their UTXOs. Reject explicitly instead of silently
  // reporting a zero balance for an address that may actually hold funds.
  if (isByronAddress(address)) {
    throw new Error("Byron addresses are not supported");
  }

  const paymentKey = extractPaymentKeyFromAddress(address);
  const stakeKey = extractStakeKeyFromAddress(address);

  // The transaction-history fetch (for UTXOs) and the delegation fetch are independent network
  // calls, so run them in parallel — the history pagination can be sizeable.
  const [transactions, delegation] = await Promise.all([
    paymentKey === EMPTY_CREDENTIAL_KEY
      ? Promise.resolve<APITransaction[]>([])
      : fetchAllTransactionsByPaymentKey(paymentKey, currency),
    stakeKey ? getDelegationInfo(currency, stakeKey) : Promise.resolve(undefined),
  ]);

  const utxos = computeUtxosForPaymentKey(transactions, paymentKey);
  const utxosSum = utxos.reduce((sum, u) => sum.plus(u.amount), new BigNumber(0));
  const tokens = mergeTokens(utxos.flatMap(u => u.tokens)).filter(t => t.amount.gt(0));

  const rewards = delegation?.rewards ?? new BigNumber(0);

  // Non-spendable part: min-ADA backing the held tokens + unwithdrawn rewards (which are
  // not directly spendable unless the account is delegated to a dRep). Mirrors the legacy
  // synchronisation's spendableBalance computation.
  const minAdaForTokens = tokens.length
    ? await computeMinAdaForTokens(currency, address, tokens)
    : new BigNumber(0);
  const lockedRewards = delegation?.dRepHex ? new BigNumber(0) : rewards;
  const nativeValue = utxosSum.plus(rewards);
  const locked = BigNumber.min(minAdaForTokens.plus(lockedRewards), nativeValue);

  const balances: Balance[] = [
    {
      value: BigInt(nativeValue.toFixed()),
      asset: NATIVE_ASSET,
      locked: BigInt(locked.toFixed()),
    },
  ];

  const stake = buildStake(address, stakeKey, delegation);
  if (stake) {
    balances.push({ value: stake.amount, asset: NATIVE_ASSET, stake });
  }

  for (const token of tokens) {
    balances.push({
      value: BigInt(token.amount.toFixed()),
      asset: {
        // Cardano's canonical token asset id: policyId (28 bytes) concatenated with the asset
        // name, no separator (mirrors getTokenAssetId in buildSubAccounts). Keeps the reference
        // mappable to existing Cardano token identifiers / currency ids.
        type: "token",
        assetReference: `${token.policyId}${token.assetName}`,
        assetOwner: address,
      },
    });
  }

  return balances;
}
