import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import type { Account, Operation, TokenAccount } from "@ledgerhq/types-live";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { makeXrpAccount } from "../fixtures";
import { getBridges, newFundedWallet, setLocalXrpConfig } from "../helpers";
import {
  ASF_ALLOW_TRUSTLINE_CLAWBACK,
  ASF_DEFAULT_RIPPLE,
  clawbackIou,
  closeTrustLine,
  enableAccountFlag,
  issue,
  openTrustLine,
  setTransferRate,
} from "../local-tx";
import { getTrustLineBalance, waitForOperationInclusion, type XrplWallet } from "../rippled";
import { buildXrpSigner } from "../signer";
import { installTokenStore, iouAmount, makeIouToken } from "../tokens";

global.console = require("console");
jest.setTimeout(600_000);

type XrpScenarioTransaction = ScenarioTransaction<GenericTransaction, Account>;

/** 25 % on each holder-to-holder transfer of the issuer's tokens. */
const TRANSFER_RATE = 1_250_000_000;

let stopRemoteGuard: (() => void) | undefined;
let holder: XrplWallet;
let issuer: XrplWallet;
let recipient: XrplWallet;
/** USD and usd: one issuer, two codes that differ only by case. */
let usdUpperId: string;
let usdLowerId: string;
let step = 0;

function getSubAccount(account: Account, id: string): TokenAccount {
  const found = account.subAccounts?.find(sub => sub.id === id);
  if (!found) throw new Error(`no sub-account ${id}`);

  return found;
}

function getFeesOperation(account: Account, hash: string): Operation {
  const found = account.operations.find(op => op.hash === hash);
  if (!found) throw new Error(`no parent operation ${hash}`);

  return found;
}

/** Asserts the holder sent `sent` and paid its fee in XRP on the parent account. */
function expectSentByHolder(previous: Account, current: Account, sent: Operation): void {
  expect(sent.type).toBe("OUT");
  expect(sent.hasFailed).toBe(false);
  expect(sent.senders).toEqual([holder.address]);
  expect(sent.recipients).toContain(recipient.address);
  const fees = getFeesOperation(current, sent.hash);
  expect(fees.type).toBe("FEES");
  expect(fees.value).toStrictEqual(fees.fee);
  expect(current.balance).toStrictEqual(previous.balance.minus(fees.fee));
}

function makeTransactions(): XrpScenarioTransaction[] {
  const optInUsdUpper: XrpScenarioTransaction = {
    name: "Opt in to USD",
    mode: "changeTrust",
    assetReference: "USD",
    assetOwner: issuer.address,
    recipient: issuer.address,
    amount: iouAmount("1000"),
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(latest.type).toBe("OPT_IN");
      expect(current.subAccounts).toHaveLength(1);
      expect(getSubAccount(current, usdUpperId).balance.toFixed()).toBe("0");
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.fee));
    },
  };

  const optInUsdLower: XrpScenarioTransaction = {
    name: "Opt in to usd, same issuer as USD",
    mode: "changeTrust",
    assetReference: "usd",
    assetOwner: issuer.address,
    recipient: issuer.address,
    amount: iouAmount("1000"),
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(latest.type).toBe("OPT_IN");
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.fee));
      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, usdLowerId).balance.toFixed()).toBe("0");
      expect(getSubAccount(current, usdUpperId).balance).toStrictEqual(
        getSubAccount(previous, usdUpperId).balance,
      );
    },
  };

  const sendUsdUpper: XrpScenarioTransaction = {
    name: "Send 10 USD under a 25 % transfer rate",
    subAccountId: usdUpperId,
    assetReference: "USD",
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: iouAmount("10"),
    expect: async (previous, current) => {
      for (const [id, held] of [
        [usdUpperId, "100"],
        [usdLowerId, "50"],
      ]) {
        const [received] = getSubAccount(previous, id).operations;
        expect(received.type).toBe("IN");
        expect(received.senders).toContain(issuer.address);
        expect(getSubAccount(previous, id).balance).toStrictEqual(iouAmount(held));
      }

      expect(current.subAccounts).toHaveLength(2);
      const usdUpper = getSubAccount(current, usdUpperId);
      expect(usdUpper.balance).toStrictEqual(iouAmount("87.5"));
      const [sent] = usdUpper.operations;
      expectSentByHolder(previous, current, sent);
      // An op value is the holder's debit, transfer fee included: balance history depends on it.
      expect(sent.value).toStrictEqual(iouAmount("12.5"));
      expect(await getTrustLineBalance(recipient.address, "USD", issuer.address)).toBe("10");
      expect(getSubAccount(current, usdLowerId).balance).toStrictEqual(iouAmount("50"));
    },
  };

  const sendMaxUsdUpper: XrpScenarioTransaction = {
    name: "Send max USD after a clawback",
    subAccountId: usdUpperId,
    assetReference: "USD",
    assetOwner: issuer.address,
    recipient: recipient.address,
    useAllAmount: true,
    expect: async (previous, current) => {
      const [clawedBack] = getSubAccount(previous, usdUpperId).operations;
      expect(clawedBack.type).toBe("OUT");
      expect(clawedBack.recipients).toContain(issuer.address);
      expect(clawedBack.value).toStrictEqual(iouAmount("5"));
      expect(getSubAccount(previous, usdUpperId).balance).toStrictEqual(iouAmount("82.5"));

      expect(current.subAccounts).toHaveLength(2);
      const usdUpper = getSubAccount(current, usdUpperId);
      const [sent] = usdUpper.operations;
      expectSentByHolder(previous, current, sent);
      expect(sent.value).toStrictEqual(iouAmount("82.5"));
      expect(usdUpper.balance.toFixed()).toBe("0");
      expect(await getTrustLineBalance(recipient.address, "USD", issuer.address)).toBe("76");
    },
  };

  const sendUsdLowerAfterOptOut: XrpScenarioTransaction = {
    name: "Send 10 usd after an opt-out of USD made outside Ledger Live",
    subAccountId: usdLowerId,
    assetReference: "usd",
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: iouAmount("10"),
    expect: async (previous, current) => {
      const [optOut] = previous.operations;
      expect(optOut.type).toBe("OPT_OUT");
      expect(optOut.hasFailed).toBe(false);
      expect(optOut.senders).toEqual([holder.address]);
      expect(await getTrustLineBalance(holder.address, "USD", issuer.address)).toBeUndefined();
      // The opt-out adds nothing to the USD history and keeps what was there.
      const usdUpper = getSubAccount(previous, usdUpperId);
      expect(usdUpper.balance.toFixed()).toBe("0");
      expect(usdUpper.operations[0].value).toStrictEqual(iouAmount("82.5"));

      expect(current.subAccounts).toHaveLength(2);
      const usdLower = getSubAccount(current, usdLowerId);
      expect(usdLower.balance).toStrictEqual(iouAmount("37.5"));
      const [sent] = usdLower.operations;
      expectSentByHolder(previous, current, sent);
      expect(sent.value).toStrictEqual(iouAmount("12.5"));
      expect(await getTrustLineBalance(recipient.address, "usd", issuer.address)).toBe("10");
      expect(getSubAccount(current, usdUpperId).balance.toFixed()).toBe("0");
    },
  };

  return [optInUsdUpper, optInUsdLower, sendUsdUpper, sendMaxUsdUpper, sendUsdLowerAfterOptOut];
}

export const scenarioXrpIou: Scenario<GenericTransaction, Account> = {
  name: "Ledger Live XRP — IOU tokens",

  setup: async () => {
    stopRemoteGuard = forbidRemoteRequests();
    holder = await newFundedWallet();
    issuer = await newFundedWallet();
    recipient = await newFundedWallet();

    // Clawback can be allowed only before the issuer has any trust line.
    await enableAccountFlag(issuer, ASF_DEFAULT_RIPPLE);
    await enableAccountFlag(issuer, ASF_ALLOW_TRUSTLINE_CLAWBACK);
    await setTransferRate(issuer, TRANSFER_RATE);

    await openTrustLine(recipient, { currency: "USD", issuer: issuer.address, limit: "1000" });
    await openTrustLine(recipient, { currency: "usd", issuer: issuer.address, limit: "1000" });

    const usdUpper = makeIouToken("USD", issuer.address);
    const usdLower = makeIouToken("usd", issuer.address);
    installTokenStore([usdUpper, usdLower]);
    setLocalXrpConfig(["iou", "mpt"]);

    const { currencyBridge, accountBridge } = await getBridges(buildXrpSigner(holder));
    const account = makeXrpAccount(holder.address);
    usdUpperId = encodeTokenAccountId(account.id, usdUpper);
    usdLowerId = encodeTokenAccountId(account.id, usdLower);
    step = 0;

    return {
      currencyBridge,
      accountBridge,
      account,
      retryInterval: 2000,
      retryLimit: 20,
    };
  },

  getTransactions: () => makeTransactions(),

  mockIndexer: async (_account, optimistic) => {
    await waitForOperationInclusion(optimistic.hash);
  },

  beforeAll: account => {
    expect(account.subAccounts).toEqual([]);
  },

  beforeEach: async () => {
    step += 1;
    if (step === 3) {
      await issue(issuer, holder.address, {
        currency: "USD",
        issuer: issuer.address,
        value: "100",
      });
      await issue(issuer, holder.address, { currency: "usd", issuer: issuer.address, value: "50" });
    }

    if (step === 4) {
      await clawbackIou(issuer, { holder: holder.address, currency: "USD", value: "5" });
    }

    if (step === 5) {
      await closeTrustLine(holder, { currency: "USD", issuer: issuer.address });
    }
  },

  afterAll: account => {
    expect(account.subAccounts).toHaveLength(2);
    expect(getSubAccount(account, usdLowerId).balance).toStrictEqual(iouAmount("37.5"));
    expect(getSubAccount(account, usdUpperId).balance.toFixed()).toBe("0");
    const count = (type: string) => account.operations.filter(op => op.type === type).length;
    expect(count("OPT_IN")).toBe(2);
    expect(count("OPT_OUT")).toBe(1);
    expect(count("FEES")).toBe(3);
  },

  teardown: () => {
    stopRemoteGuard?.();
  },
};
