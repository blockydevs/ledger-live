import BigNumber from "bignumber.js";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import type { Account } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account/index";
import { getCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import { buildSigner } from "../signer";
import { getBridges, type MultiversXBridges } from "../helpers";
import {
  clearHistoryRequests,
  initMswHandlers,
  readHistoryRequestsAfter,
  registerProvider,
  resetIndexer,
} from "../indexer";
import type { DeviceCommand } from "../recordingDevice";
import {
  advanceToEpoch,
  fundAccount,
  killChainSimulator,
  setState,
  spawnChainSimulator,
} from "../chainSimulator";
import { issueEsdt, makeEsdtPairs } from "../esdt";
import {
  PROVIDER_CREATION_COST,
  advanceUntilUnbondable,
  createDelegationProvider,
} from "../staking";
import type { MultiversXAccount } from "@ledgerhq/coin-multiversx/types";
import {
  INITIAL_EGLD_FUNDING,
  MULTIVERSX_API_URL,
  MULTIVERSX_DELEGATION_API_URL,
  RECIPIENT,
  makeAccount,
  makeEsdtToken,
  registerEsdtToken,
} from "../fixtures";

global.console = require("console");
jest.setTimeout(1_000_000);

type MultiversXScenarioTransaction = ScenarioTransaction<GenericTransaction, Account>;

const DERIVATION_PATH = "44'/508'/0'/0'/0'";
const MULTIVERSX = getCryptoCurrencyById("elrond");
const ONE_EGLD = new BigNumber("1000000000000000000"); // 1 EGLD (18 decimals)
const ONE_USDC = new BigNumber("1000000"); // 1 USDC (6 decimals)

const USDC_DECIMALS = 6;
const USDC_TICKER = "TUSDC";
const ESDT_ISSUE_SUPPLY = 1_000_000n * 10n ** 6n; // 1,000,000 USDC total supply
const INITIAL_USDC_FUNDING = 1000n * 10n ** 6n; // 1000 USDC credited to the scenario account
// ESDT epoch gate: the system contract is disabled at genesis.
const ESDT_ENABLE_EPOCH = 2;

// Set during setup (the identifier is only known after issuance), read by getTransactions.
let scenarioToken: TokenCurrency;
// The staking provider opened during setup.
let provider: string;
// Set during setup for the generic-adapter strategy only.
let device: MultiversXBridges["device"];

/**
 * The device handshake of the transaction just signed: address selection before every signature.
 * Read-only, since the tester retries an `expect` until the indexer catches up; `beforeEach` clears it.
 */
function expectDeviceCommands(expected: DeviceCommand[]) {
  if (device) expect(device.readCommands()).toEqual(expected);
}

// How far before its resume point the coin module reads history again (`listOperations`).
const RESUME_MARGIN_SECONDS = 60;

/**
 * Once the account holds operations, a sync asks only for the native history since the newest of
 * them — not for the whole history again.
 */
function expectIncrementalHistory(previousAccount: Account) {
  const newestSeconds = Math.floor(previousAccount.operations[0].date.getTime() / 1000);
  const requests = readHistoryRequestsAfter();
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter(after => after < newestSeconds - RESUME_MARGIN_SECONDS)).toStrictEqual([]);
}

function delegationAt(account: Account) {
  return (account as MultiversXAccount).multiversxResources?.delegations.find(
    d => d.contract === provider,
  );
}

/** The amount a staking operation moved, kept apart from its value in `extra.amount`. */
function stakingAmount(operation: Account["operations"][number]): string | undefined {
  return (operation.extra as { amount?: BigNumber | string } | undefined)?.amount?.toString();
}

// The staking flows build transactions with the MultiversX mode names, which the generic bridge
// maps itself (`families/multiversx/bridge/api.ts`), so the scenario sends those names too.
const multiversxMode = (mode: string) => mode as GenericTransaction["mode"];

/**
 * Delegate, claim, undelegate and withdraw with one provider. `reDelegateRewards` is left out: a
 * provider without validator nodes earns no rewards, so the contract rejects it on the simulator.
 */
function makeStakingTransactions(): MultiversXScenarioTransaction[] {
  const delegate: MultiversXScenarioTransaction = {
    name: "Delegate 1 EGLD",
    mode: "delegate",
    amount: ONE_EGLD,
    recipient: provider,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", "sign"]);
      expectIncrementalHistory(previousAccount);
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toEqual(1);
      expect(latestOperation.type).toEqual("DELEGATE");
      expect(stakingAmount(latestOperation)).toEqual(ONE_EGLD.toFixed());
      expect(currentAccount.balance).toStrictEqual(
        previousAccount.balance.minus(latestOperation.fee),
      );
      expect(currentAccount.spendableBalance).toStrictEqual(
        previousAccount.spendableBalance.minus(ONE_EGLD).minus(latestOperation.fee),
      );
      expect(delegationAt(currentAccount)?.userActiveStake).toEqual(ONE_EGLD.toFixed());
    },
  };

  const claimRewards: MultiversXScenarioTransaction = {
    name: "Claim rewards",
    mode: multiversxMode("claimRewards"),
    amount: new BigNumber(0),
    recipient: provider,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", "sign"]);
      expectIncrementalHistory(previousAccount);
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toEqual(1);
      expect(latestOperation.type).toEqual("REWARD");
      expect(latestOperation.hasFailed).toBeFalsy();
      expect(currentAccount.spendableBalance).toStrictEqual(
        previousAccount.spendableBalance.minus(latestOperation.fee),
      );
    },
  };

  const unDelegate: MultiversXScenarioTransaction = {
    name: "Undelegate 1 EGLD",
    mode: multiversxMode("unDelegate"),
    amount: ONE_EGLD,
    recipient: provider,
    expect: async (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", "sign"]);
      expectIncrementalHistory(previousAccount);
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toEqual(1);
      expect(latestOperation.type).toEqual("UNDELEGATE");
      expect(stakingAmount(latestOperation)).toEqual(ONE_EGLD.toFixed());
      // Unbonding funds still count in the balance until they are withdrawn.
      expect(currentAccount.balance).toStrictEqual(
        previousAccount.balance.minus(latestOperation.fee),
      );
      const delegation = delegationAt(currentAccount);
      expect(delegation?.userActiveStake).toEqual("0");
      expect(delegation?.userUndelegatedList.map(u => u.amount)).toStrictEqual([
        ONE_EGLD.toFixed(),
      ]);
      // Last, once the assertions pass: the next transaction withdraws after the unbonding period.
      await advanceUntilUnbondable(currentAccount.freshAddress, provider);
    },
  };

  const withdraw: MultiversXScenarioTransaction = {
    name: "Withdraw 1 EGLD",
    mode: "withdraw",
    amount: new BigNumber(0),
    recipient: provider,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", "sign"]);
      expectIncrementalHistory(previousAccount);
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toEqual(1);
      expect(latestOperation.type).toEqual("WITHDRAW_UNBONDED");
      expect(stakingAmount(latestOperation)).toEqual(ONE_EGLD.toFixed());
      expect(currentAccount.balance).toStrictEqual(
        previousAccount.balance.minus(latestOperation.fee),
      );
      expect(currentAccount.spendableBalance).toStrictEqual(
        previousAccount.spendableBalance.plus(ONE_EGLD).minus(latestOperation.fee),
      );
      expect(delegationAt(currentAccount)).toBeUndefined();
    },
  };

  return [delegate, claimRewards, unDelegate, withdraw];
}

function makeScenarioTransactions(address: string): MultiversXScenarioTransaction[] {
  const usdcSubAccountId = encodeTokenAccountId(`js:2:elrond:${address}:`, scenarioToken);

  const sendEgld: MultiversXScenarioTransaction = {
    name: "Send 1 EGLD",
    mode: "send",
    amount: ONE_EGLD,
    recipient: RECIPIENT,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", "sign"]);
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toEqual(1);
      expect(latestOperation.type).toEqual("OUT");
      expect(latestOperation.value).toStrictEqual(latestOperation.fee.plus(ONE_EGLD));
      expect(latestOperation.senders).toStrictEqual([address]);
      expect(latestOperation.recipients).toStrictEqual([RECIPIENT]);
      expect(currentAccount.balance).toStrictEqual(
        previousAccount.balance.minus(latestOperation.value),
      );
    },
  };

  const sendUsdc: MultiversXScenarioTransaction = {
    name: "Send 1 USDC",
    mode: "send",
    amount: ONE_USDC,
    recipient: RECIPIENT,
    subAccountId: usdcSubAccountId,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", `provideESDTInfo:${USDC_TICKER}`, "sign"]);
      const currentSub = currentAccount.subAccounts?.find(sa => sa.id === usdcSubAccountId);
      const previousSub = previousAccount.subAccounts?.find(sa => sa.id === usdcSubAccountId);
      const [latestSubOperation] = currentSub?.operations ?? [];
      expect(latestSubOperation.type).toEqual("OUT");
      expect(latestSubOperation.value).toStrictEqual(ONE_USDC);
      expect(latestSubOperation.senders).toStrictEqual([address]);
      expect(latestSubOperation.recipients).toStrictEqual([RECIPIENT]);
      expect(currentSub?.balance).toStrictEqual(previousSub?.balance.minus(ONE_USDC));
    },
  };

  const sendAllUsdc: MultiversXScenarioTransaction = {
    name: "Send all USDC",
    mode: "send",
    useAllAmount: true,
    recipient: RECIPIENT,
    subAccountId: usdcSubAccountId,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", `provideESDTInfo:${USDC_TICKER}`, "sign"]);
      // The ESDT transfer produces a new parent operation (fees paid in EGLD).
      expect(currentAccount.operations.length).toBeGreaterThan(previousAccount.operations.length);
      const currentSub = currentAccount.subAccounts?.find(sa => sa.id === usdcSubAccountId);
      if (currentSub) expect(currentSub.spendableBalance).toEqual(new BigNumber(0));
    },
  };

  // Send-max EGLD must come last: it drains the spendable balance (ESDT transfers
  // still need EGLD for gas, so they run before this).
  const sendMaxEgld: MultiversXScenarioTransaction = {
    name: "Send max EGLD",
    mode: "send",
    useAllAmount: true,
    recipient: RECIPIENT,
    expect: (previousAccount: Account, currentAccount: Account) => {
      expectDeviceCommands(["setAddress", "sign"]);
      expectIncrementalHistory(previousAccount);
      const [latestOperation] = currentAccount.operations;
      expect(currentAccount.operations.length - previousAccount.operations.length).toEqual(1);
      expect(latestOperation.type).toEqual("OUT");
      expect(latestOperation.senders).toStrictEqual([address]);
      expect(latestOperation.recipients).toStrictEqual([RECIPIENT]);
      expect(currentAccount.balance).toStrictEqual(
        previousAccount.balance.minus(latestOperation.value),
      );
      expect(currentAccount.spendableBalance).toStrictEqual(new BigNumber(0));
    },
  };

  return [sendEgld, sendUsdc, sendAllUsdc, ...makeStakingTransactions(), sendMaxEgld];
}

let closeMSW: (() => void) | null = null;

export const scenarioMultiversx: Scenario<GenericTransaction, Account> = {
  name: "Ledger Live Basic MultiversX Transactions",
  setup: async strategy => {
    const multiversxConfig = {
      type: "object" as const,
      default: {
        status: { type: "active" },
        name: "MultiversX",
        unit: { name: "EGLD", code: "EGLD", magnitude: 18 },
        apiEndpoint: MULTIVERSX_API_URL,
        delegationApiEndpoint: MULTIVERSX_DELEGATION_API_URL,
      },
    };
    LiveConfig.setConfig({
      config_currency_elrond: multiversxConfig,
    });
    resetIndexer();
    await spawnChainSimulator();
    // The ESDT system contract is disabled at genesis; advance past the enable epoch.
    await advanceToEpoch(ESDT_ENABLE_EPOCH);

    const signer = await buildSigner();
    const bridges = await getBridges(strategy, signer);
    const { accountBridge, currencyBridge, getAddress } = bridges;
    device = bridges.device;

    const { address } = await getAddress("", {
      path: DERIVATION_PATH,
      currency: MULTIVERSX,
      derivationMode: "",
    });
    const account = makeAccount(address);

    // Register an ESDT by issuing it from a throwaway funded account (keeps the scenario
    // account's history/balance clean — it receives the token via set-state, not a transfer).
    const issuer = await buildSigner();
    const { address: issuerAddress } = await issuer.getAddress(DERIVATION_PATH);
    await fundAccount(issuerAddress, INITIAL_EGLD_FUNDING);
    const identifier = await issueEsdt(issuer, issuerAddress, DERIVATION_PATH, {
      name: "TestUSDC",
      ticker: USDC_TICKER,
      supply: ESDT_ISSUE_SUPPLY,
      decimals: USDC_DECIMALS,
    });

    // Open a staking provider from another throwaway account.
    const providerOwner = await buildSigner();
    const { address: providerOwnerAddress } = await providerOwner.getAddress(DERIVATION_PATH);
    await fundAccount(providerOwnerAddress, (PROVIDER_CREATION_COST * 2n).toString());
    provider = await createDelegationProvider(providerOwner, providerOwnerAddress);

    // Fund the scenario account: native EGLD + the ESDT balance, in one deterministic set-state.
    await setState([
      {
        address,
        nonce: 0,
        balance: INITIAL_EGLD_FUNDING,
        pairs: makeEsdtPairs(identifier, INITIAL_USDC_FUNDING),
      },
    ]);

    scenarioToken = makeEsdtToken(identifier, USDC_DECIMALS);
    registerEsdtToken(scenarioToken);

    closeMSW = initMswHandlers();
    registerProvider(provider);

    return { account, accountBridge, currencyBridge };
  },
  getTransactions: address => makeScenarioTransactions(address),
  beforeEach: () => {
    device?.clearCommands();
    clearHistoryRequests();
  },
  beforeAll: account => {
    expect(account.balance.toString()).toEqual(INITIAL_EGLD_FUNDING);
    expect(account.operations.length).toEqual(0);
  },
  teardown: async () => {
    closeMSW?.();
    closeMSW = null;
    resetIndexer();
    await killChainSimulator();
  },
};
