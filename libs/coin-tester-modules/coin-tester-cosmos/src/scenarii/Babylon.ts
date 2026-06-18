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
let redelegateDestValidator = "";

async function getBondedValidators(): Promise<[string, string]> {
  const res = await fetch(`${LOCAL_LCD}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`);
  const data = (await res.json()) as { validators?: Array<{ operator_address?: string }> };
  const operators = (data.validators ?? [])
    .map(v => v.operator_address)
    .filter((a): a is string => Boolean(a));
  if (operators.length < 2) {
    throw new Error(
      `Devnet expected >=2 bonded validators, got ${operators.length} — entrypoint's gentx may have failed`,
    );
  }
  return [operators[0], operators[1]];
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
      // Devnet may have produced negligible rewards by this point; just
      // assert the op landed correctly. value can be 0 with no rewards yet.
      const extra = latestOperation.extra as CosmosOperationExtra;
      expect(extra.validators?.[0]?.address).toBe(validatorAddress);
    },
  },
  {
    name: "Redelegate 30 BABY (wrapped via x/epoching)",
    mode: "redelegate",
    sourceValidator: validatorAddress,
    validators: [
      {
        address: redelegateDestValidator,
        amount: parseCurrencyUnit(babylon.units[0], "30"),
      },
    ],
    expect: (previousAccount, currentAccount) => {
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
      expect(latestOperation.type).toBe("REDELEGATE");
      // op.value for REDELEGATE is just the fee — principal moves between
      // validators, nothing leaves the delegator's bonded pool.
      expect(latestOperation.value.toFixed()).toBe(latestOperation.fee.toFixed());
      // After the next epoch ticks, the destination validator shows up in
      // delegations. The wrapped MsgBeginRedelegate is queued until then.
      expect(
        currentAccount.cosmosResources.delegations.some(
          d => d.validatorAddress === redelegateDestValidator,
        ),
      ).toBe(true);
      // Total delegated balance is unchanged — redelegation shifts shares
      // between validators, it doesn't bond or unbond.
      expect(currentAccount.cosmosResources.delegatedBalance.toFixed()).toBe(
        previousAccount.cosmosResources.delegatedBalance.toFixed(),
      );
      const extra = latestOperation.extra as CosmosOperationExtra;
      expect(extra.validators?.[0]?.address).toBe(redelegateDestValidator);
    },
  },
  {
    name: "Undelegate 50 BABY (wrapped via x/epoching)",
    mode: "undelegate",
    validators: [
      {
        address: validatorAddress,
        amount: parseCurrencyUnit(babylon.units[0], "50"),
      },
    ],
    expect: (previousAccount, currentAccount) => {
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
      expect(latestOperation.type).toBe("UNDELEGATE");
      expect(latestOperation.value.toFixed()).toBe(latestOperation.fee.toFixed());
      // After the next epoch ticks, the unbonding entry materializes.
      expect(
        currentAccount.cosmosResources.unbondings.some(u => u.validatorAddress === validatorAddress),
      ).toBe(true);
      expect(currentAccount.cosmosResources.unbondingBalance.toFixed()).toBe(
        parseCurrencyUnit(babylon.units[0], "50").toFixed(),
      );
    },
  },
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

    // Validator addresses are dynamic per `babylond testnet` run; the entrypoint
    // bootstraps 2 bonded validators (--v 2) so we can redelegate between them.
    [validatorAddress, redelegateDestValidator] = await getBondedValidators();

    const account = makeAccount(address, babylon);
    return {
      // Drop the narrower CosmosOperation generic — Scenario expects the
      // 2-arity AccountBridge; cast is sound because Scenario only exposes
      // the base interface.
      accountBridge: accountBridge as AccountBridge<CosmosTransaction, CosmosAccount>,
      currencyBridge,
      account,
      // Stretch retry budget: the wrapped delegate/undelegate ops need the next
      // epoch tick (~10 blocks × 1s/block = 10s) before the LCD reflects them.
      // 1s × 60 retries = 60s ceiling — plenty of headroom for epoch drift on
      // a contended runner.
      retryInterval: 1000,
      retryLimit: 60,
    };
  },

  getTransactions,

  beforeAll: async account => {
    // entrypoint.sh funds the dev account with 1,000,000 BABY.
    expect(formatCurrencyUnit(babylon.units[0], account.balance, { useGrouping: false })).toBe(
      "1000000",
    );
  },

  teardown: async () => {
    await killBabylond();
  },
};
