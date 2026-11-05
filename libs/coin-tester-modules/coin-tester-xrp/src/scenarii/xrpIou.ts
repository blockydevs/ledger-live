import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import type { Account } from "@ledgerhq/types-live";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { makeXrpAccount } from "../fixtures";
import { getBridges, createFundedWallet, setLocalXrpConfig } from "../helpers";
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
import { installTokenStore, toIouAmount, makeIouToken } from "../tokens";
import { countOperations, expectSentByHolder, getSubAccount } from "./shared";

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

const ISSUE_STEP = 3;
const CLAWBACK_STEP = 4;
const OPT_OUT_STEP = 5;

function makeTransactions(): XrpScenarioTransaction[] {
  const optInUsdUpper: XrpScenarioTransaction = {
    name: "Opt in to USD",
    mode: "changeTrust",
    assetReference: "USD",
    assetOwner: issuer.address,
    recipient: issuer.address,
    amount: toIouAmount("1000"),
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(current.operations.length - previous.operations.length).toBe(1);
      expect(latest.type).toBe("OPT_IN");
      expect(latest.hasFailed).toBe(false);
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
    amount: toIouAmount("1000"),
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(current.operations.length - previous.operations.length).toBe(1);
      expect(latest.type).toBe("OPT_IN");
      expect(latest.hasFailed).toBe(false);
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.fee));
      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, usdLowerId).balance.toFixed()).toBe("0");
      const usdUpperBalance = getSubAccount(previous, usdUpperId).balance;
      expect(getSubAccount(current, usdUpperId).balance).toStrictEqual(usdUpperBalance);
    },
  };

  const sendUsdUpper: XrpScenarioTransaction = {
    name: "Send 10 USD under a 25 % transfer rate",
    subAccountId: usdUpperId,
    assetReference: "USD",
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: toIouAmount("10"),
    expect: async (previous, current) => {
      for (const [id, held] of [
        [usdUpperId, "100"],
        [usdLowerId, "50"],
      ]) {
        const [received] = getSubAccount(previous, id).operations;
        expect(received.type).toBe("IN");
        expect(received.senders).toContain(issuer.address);
        expect(getSubAccount(previous, id).balance).toStrictEqual(toIouAmount(held));
      }

      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, usdUpperId).balance).toStrictEqual(toIouAmount("87.5"));
      const sent = expectSentByHolder(previous, current, usdUpperId, { holder, recipient });
      // An op value is the holder's debit, transfer fee included: balance history depends on it.
      expect(sent.value).toStrictEqual(toIouAmount("12.5"));
      expect(await getTrustLineBalance(recipient.address, "USD", issuer.address)).toBe("10");
      expect(getSubAccount(current, usdLowerId).balance).toStrictEqual(toIouAmount("50"));
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
      expect(clawedBack.value).toStrictEqual(toIouAmount("5"));
      expect(getSubAccount(previous, usdUpperId).balance).toStrictEqual(toIouAmount("82.5"));

      expect(current.subAccounts).toHaveLength(2);
      const sent = expectSentByHolder(previous, current, usdUpperId, { holder, recipient });
      expect(sent.value).toStrictEqual(toIouAmount("82.5"));
      expect(getSubAccount(current, usdUpperId).balance.toFixed()).toBe("0");
      expect(await getTrustLineBalance(recipient.address, "USD", issuer.address)).toBe("76");
    },
  };

  const sendUsdLowerAfterOptOut: XrpScenarioTransaction = {
    name: "Send 10 usd after an opt-out of USD made outside Ledger Live",
    subAccountId: usdLowerId,
    assetReference: "usd",
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: toIouAmount("10"),
    expect: async (previous, current) => {
      const [optOut] = previous.operations;
      expect(optOut.type).toBe("OPT_OUT");
      expect(optOut.hasFailed).toBe(false);
      expect(optOut.senders).toEqual([holder.address]);
      expect(await getTrustLineBalance(holder.address, "USD", issuer.address)).toBeUndefined();
      // The opt-out adds nothing to the USD history and keeps what was there.
      const usdUpper = getSubAccount(previous, usdUpperId);
      expect(usdUpper.balance.toFixed()).toBe("0");
      expect(usdUpper.operations[0].value).toStrictEqual(toIouAmount("82.5"));

      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, usdLowerId).balance).toStrictEqual(toIouAmount("37.5"));
      const sent = expectSentByHolder(previous, current, usdLowerId, { holder, recipient });
      expect(sent.value).toStrictEqual(toIouAmount("12.5"));
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
    holder = await createFundedWallet();
    issuer = await createFundedWallet();
    recipient = await createFundedWallet();

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
    if (step === ISSUE_STEP) {
      await issue(issuer, holder.address, {
        currency: "USD",
        issuer: issuer.address,
        value: "100",
      });
      await issue(issuer, holder.address, { currency: "usd", issuer: issuer.address, value: "50" });
    }

    if (step === CLAWBACK_STEP) {
      await clawbackIou(issuer, { holder: holder.address, currency: "USD", value: "5" });
    }

    if (step === OPT_OUT_STEP) {
      await closeTrustLine(holder, { currency: "USD", issuer: issuer.address });
    }
  },

  afterAll: account => {
    expect(account.subAccounts).toHaveLength(2);
    expect(getSubAccount(account, usdLowerId).balance).toStrictEqual(toIouAmount("37.5"));
    expect(getSubAccount(account, usdUpperId).balance.toFixed()).toBe("0");
    expect(countOperations(account, "OPT_IN")).toBe(2);
    expect(countOperations(account, "OPT_OUT")).toBe(1);
    expect(countOperations(account, "FEES")).toBe(3);
  },

  teardown: () => {
    stopRemoteGuard?.();
  },
};
