import BigNumber from "bignumber.js";
import { AccountBridge } from "@ledgerhq/types-live";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { formatCurrencyUnit, parseCurrencyUnit } from "@ledgerhq/coin-module-framework/currencies";
import { createBridges } from "@ledgerhq/coin-cosmos/bridge/index";
import { CosmosCoinConfig } from "@ledgerhq/coin-cosmos/config";
import resolver from "@ledgerhq/coin-cosmos/hw-getAddress";
import {
  CosmosAccount,
  CosmosCurrencyConfig,
  CosmosOperationExtra,
  Transaction as CosmosTransaction,
} from "@ledgerhq/coin-cosmos/types/index";
import { killBabylond, spawnBabylond } from "../babylond";
import { makeAccount } from "../fixtures";
import { DEV_ADDRESS, babylon } from "../helpers";
import { buildSigner } from "../signer";

type CosmosScenarioTransaction = ScenarioTransaction<CosmosTransaction, CosmosAccount>;

const LOCAL_LCD = "http://127.0.0.1:1317";

// Override coin-cosmos's default Babylon config: point sync + broadcast at the
// local node. Runtime shape is flat (CosmosCurrencyConfig + status); the
// declared CosmosCoinConfig type wraps everything in ConfigInfo, which is what
// LiveConfig stores but NOT what `() => config` returns (chain.ts spreads
// coinConfig as flat fields).
const coinConfig = {
  lcd: LOCAL_LCD,
  minGasPrice: 0.002,
  status: { type: "active" as const },
} satisfies CosmosCurrencyConfig & { status: { type: "active" } };

// Populated in setup() before getTransactions() runs.
let recipientAddress = "";
let validatorAddress = "";
async function getBondedValidator(): Promise<string> {
  const res = await fetch(`${LOCAL_LCD}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`);
  const data = (await res.json()) as { validators?: Array<{ operator_address?: string }> };
  const operators = (data.validators ?? [])
    .map(v => v.operator_address)
    .filter((a): a is string => Boolean(a));
  if (operators.length < 1) {
    throw new Error(
      `Devnet expected >=1 bonded validator, got ${operators.length} — entrypoint's gentx may have failed`,
    );
  }
  return operators[0];
}

const getTransactions = (): CosmosScenarioTransaction[] => [
  {
    name: "Send 1 BABY",
    mode: "send",
    recipient: recipientAddress,
    amount: parseCurrencyUnit(babylon.units[0], "1"),
    expect: (previousAccount, currentAccount) => {
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
      expect(latestOperation.type).toBe("OUT");
      // op.value = amount + fee for an OUT
      expect(latestOperation.value.toFixed()).toBe(
        latestOperation.fee.plus(parseCurrencyUnit(babylon.units[0], "1")).toFixed(),
      );
      expect(currentAccount.balance.toFixed()).toBe(
        previousAccount.balance.minus(latestOperation.value).toFixed(),
      );
    },
  },
  {
    name: "Delegate 100 BABY (wrapped via x/epoching)",
    mode: "delegate",
    // Delegate is keyed on transaction.amount across the whole cosmos module:
    // getTransactionStatus.getDelegateTransactionStatus validates it and
    // buildTransaction's "delegate" case reads it — unlike redelegate/undelegate,
    // which read validators[].amount. So the delegated amount goes in
    // transaction.amount; validators[0] only supplies the target address (its
    // amount is unused by the delegate build path, kept for symmetry below).
    amount: parseCurrencyUnit(babylon.units[0], "100"),
    validators: [
      {
        address: validatorAddress,
        amount: parseCurrencyUnit(babylon.units[0], "100"),
      },
    ],
    expect: (previousAccount, currentAccount) => {
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
      expect(latestOperation.type).toBe("DELEGATE");
      // op.value for DELEGATE is just the fee — principal is bonded, not spent.
      expect(latestOperation.value.toFixed()).toBe(latestOperation.fee.toFixed());
      // The retry loop is what gives the queued WrappedDelegate time to apply at
      // the next epoch boundary; once applied, the LCD reflects the delegation.
      expect(
        currentAccount.cosmosResources.delegations.some(d => d.validatorAddress === validatorAddress),
      ).toBe(true);
      expect(currentAccount.cosmosResources.delegatedBalance.toFixed()).toBe(
        parseCurrencyUnit(babylon.units[0], "100").toFixed(),
      );
      // Op extras name the validator we delegated to.
      const extra = latestOperation.extra as CosmosOperationExtra;
      expect(extra.validators?.[0]?.address).toBe(validatorAddress);
      expect(extra.validators?.[0]?.amount.toFixed()).toBe(
        parseCurrencyUnit(babylon.units[0], "100").toFixed(),
      );
    },
  },
  {
    name: "Claim rewards (not epoched)",
    mode: "claimReward",
    validators: [{ address: validatorAddress, amount: new BigNumber(0) }],
    expect: (previousAccount, currentAccount) => {
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
      expect(latestOperation.type).toBe("REWARD");
      // On a fresh devnet ~0 rewards have accrued by this point, so the chain
      // emits no reward-coin event and synchronisation records no per-validator
      // reward shard (extra.validators stays empty). The REWARD op type is the
      // guaranteed signal that the claim landed; only assert the validator when
      // a shard actually exists (rewards accrued).
      const extra = latestOperation.extra as CosmosOperationExtra;
      if (extra.validators?.length) {
        expect(extra.validators[0].address).toBe(validatorAddress);
      }
    },
  },
  // NOTE: undelegate and redelegate are intentionally omitted. On the babylond
  // devnet only the wrapped *delegate* applies at the epoch boundary; wrapped
  // MsgWrappedUndelegate / MsgWrappedBeginRedelegate are accepted into a block but
  // never execute (verified via LCD: source delegation unchanged, no unbonding /
  // redelegation entry materialises). The crafting is correct — covered by
  // coin-cosmos buildTransaction.unit.test.ts — so this is a chain / x-epoching
  // execution gap to resolve (needs a follow-up ticket) before adding these steps.
];

export const BabylonScenario: Scenario<CosmosTransaction, CosmosAccount> = {
  name: "Babylon Ledger Live transactions",

  setup: async _strategy => {
    await spawnBabylond();

    const signer = await buildSigner();
    const signerContext: Parameters<typeof resolver>[0] = (_, fn) => fn(signer);
    const { accountBridge, currencyBridge } = createBridges(
      signerContext,
      () => coinConfig as unknown as CosmosCoinConfig,
    );

    const getAddress = resolver(signerContext);
    const { address } = await getAddress("", {
      path: "44'/118'/0'/0/0",
      currency: babylon,
      derivationMode: "",
    });
    if (address !== DEV_ADDRESS) {
      throw new Error(
        `Signer derivation drifted: got ${address}, expected ${DEV_ADDRESS} (pre-funded at genesis).`,
      );
    }

    // Recipient = deterministic alt-account-index derivation. Address validation
    // only checks the `bbn` prefix, so any well-formed bbn1… bech32 works.
    const recipient = await signer.getAddressAndPubKey([44, 118, 1, 0, 0], "bbn");
    recipientAddress = recipient.bech32_address;

    // The validator address is dynamic per `babylond testnet` run; pick the
    // first bonded validator the entrypoint bootstrapped.
    validatorAddress = await getBondedValidator();

    const account = makeAccount(address, babylon);
    return {
      // Drop the narrower CosmosOperation generic — Scenario expects the
      // 2-arity AccountBridge; cast is sound because Scenario only exposes
      // the base interface.
      accountBridge: accountBridge as AccountBridge<CosmosTransaction, CosmosAccount>,
      currencyBridge,
      account,
      // Stretch retry budget: the wrapped delegate needs the next epoch tick
      // (~10 blocks × 1s/block = 10s) before the LCD reflects it. 1s × 60 retries
      // = 60s ceiling — plenty of headroom for epoch drift on a contended runner.
      retryInterval: 1000,
      retryLimit: 60,
    };
  },

  getTransactions,

  beforeAll: async account => {
    // entrypoint.sh funds the dev account with 1,000,000 BABY at genesis. babylond
    // leaves it marginally under that after genesis processing (a small,
    // deterministic overhead — observed ~2 BABY), so assert it's funded with
    // effectively the full amount rather than to the exact ubbn.
    const baby = Number(
      formatCurrencyUnit(babylon.units[0], account.balance, { useGrouping: false }),
    );
    expect(baby).toBeGreaterThanOrEqual(999_900);
    expect(baby).toBeLessThanOrEqual(1_000_000);
  },


  teardown: async () => {
    await killBabylond();
  },
};
