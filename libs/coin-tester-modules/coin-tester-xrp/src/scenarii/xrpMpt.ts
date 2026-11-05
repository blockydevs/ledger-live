import BigNumber from "bignumber.js";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import type { Account, Operation, TokenAccount } from "@ledgerhq/types-live";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { makeXrpAccount } from "../fixtures";
import { getBridges, newFundedWallet, setLocalXrpConfig } from "../helpers";
import {
  authorizeMpt,
  clawbackMpt,
  createMptIssuance,
  issue,
  TF_MPT_CAN_CLAWBACK,
  TF_MPT_CAN_LOCK,
  TF_MPT_CAN_TRANSFER,
  unauthorizeMpt,
} from "../local-tx";
import { getMptBalance, waitForOperationInclusion, type XrplWallet } from "../rippled";
import { buildXrpSigner } from "../signer";
import { installTokenStore, makeMptToken } from "../tokens";

global.console = require("console");
jest.setTimeout(600_000);

type XrpScenarioTransaction = ScenarioTransaction<GenericTransaction, Account>;

const ASSET_SCALE = 2;
/** 25 % on each holder-to-holder transfer of issuance A, in units of 0.001 %. */
const TRANSFER_FEE = 25_000;

let stopRemoteGuard: (() => void) | undefined;
let holder: XrplWallet;
let issuer: XrplWallet;
let recipient: XrplWallet;
/** A carries the transfer fee and allows clawback, B has neither. */
let issuanceA: string;
let issuanceB: string;
let mptAId: string;
let mptBId: string;
let step = 0;

/** MPT amounts are integers in base units. */
function units(value: number): BigNumber {
  return new BigNumber(value);
}

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
  const optInA: XrpScenarioTransaction = {
    name: "Opt in to MPT A",
    mode: "changeTrust",
    assetReference: issuanceA,
    assetOwner: issuer.address,
    recipient: issuer.address,
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(latest.type).toBe("OPT_IN");
      expect(current.subAccounts).toHaveLength(1);
      expect(getSubAccount(current, mptAId).balance.toFixed()).toBe("0");
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.fee));
    },
  };

  const optInB: XrpScenarioTransaction = {
    name: "Opt in to MPT B",
    mode: "changeTrust",
    assetReference: issuanceB,
    assetOwner: issuer.address,
    recipient: issuer.address,
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(latest.type).toBe("OPT_IN");
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.fee));
      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, mptBId).balance.toFixed()).toBe("0");
    },
  };

  const sendA: XrpScenarioTransaction = {
    name: "Send 1000 A under a 25 % transfer fee",
    subAccountId: mptAId,
    assetReference: issuanceA,
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: units(1000),
    expect: async (previous, current) => {
      for (const [id, held] of [
        [mptAId, 10_000],
        [mptBId, 5000],
      ] as const) {
        const [received] = getSubAccount(previous, id).operations;
        expect(received.type).toBe("IN");
        expect(received.senders).toContain(issuer.address);
        expect(getSubAccount(previous, id).balance).toStrictEqual(units(held));
      }

      expect(current.subAccounts).toHaveLength(2);
      const mptA = getSubAccount(current, mptAId);
      expect(mptA.balance).toStrictEqual(units(8750));
      const [sent] = mptA.operations;
      expectSentByHolder(previous, current, sent);
      // An op value is the holder's debit, transfer fee included: balance history depends on it.
      expect(sent.value).toStrictEqual(units(1250));
      expect(await getMptBalance(recipient.address, issuanceA)).toBe("1000");
      expect(getSubAccount(current, mptBId).balance).toStrictEqual(units(5000));
    },
  };

  const sendMaxA: XrpScenarioTransaction = {
    name: "Send max A after a clawback",
    subAccountId: mptAId,
    assetReference: issuanceA,
    assetOwner: issuer.address,
    recipient: recipient.address,
    useAllAmount: true,
    expect: async (previous, current) => {
      const [clawedBack] = getSubAccount(previous, mptAId).operations;
      expect(clawedBack.type).toBe("OUT");
      expect(clawedBack.recipients).toContain(issuer.address);
      expect(clawedBack.value).toStrictEqual(units(500));
      expect(getSubAccount(previous, mptAId).balance).toStrictEqual(units(8250));

      expect(current.subAccounts).toHaveLength(2);
      const mptA = getSubAccount(current, mptAId);
      const [sent] = mptA.operations;
      expectSentByHolder(previous, current, sent);
      expect(sent.value).toStrictEqual(units(8250));
      expect(mptA.balance.toFixed()).toBe("0");
      // 8250 debited under a 25 % fee delivers 6600.
      expect(await getMptBalance(recipient.address, issuanceA)).toBe("7600");
    },
  };

  const sendBAfterOptOut: XrpScenarioTransaction = {
    name: "Send 1000 B after an opt-out of A made outside Ledger Live",
    subAccountId: mptBId,
    assetReference: issuanceB,
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: units(1000),
    expect: async (previous, current) => {
      const [optOut] = previous.operations;
      expect(optOut.type).toBe("OPT_OUT");
      expect(optOut.hasFailed).toBe(false);
      expect(optOut.senders).toEqual([holder.address]);
      expect(await getMptBalance(holder.address, issuanceA)).toBeUndefined();
      // The opt-out adds nothing to the A history and keeps what was there.
      const mptA = getSubAccount(previous, mptAId);
      expect(mptA.balance.toFixed()).toBe("0");
      expect(mptA.operations[0].value).toStrictEqual(units(8250));

      expect(current.subAccounts).toHaveLength(2);
      const mptB = getSubAccount(current, mptBId);
      expect(mptB.balance).toStrictEqual(units(4000));
      const [sent] = mptB.operations;
      expectSentByHolder(previous, current, sent);
      expect(sent.value).toStrictEqual(units(1000));
      expect(await getMptBalance(recipient.address, issuanceB)).toBe("1000");
      expect(getSubAccount(current, mptAId).balance.toFixed()).toBe("0");
    },
  };

  return [optInA, optInB, sendA, sendMaxA, sendBAfterOptOut];
}

export const scenarioXrpMpt: Scenario<GenericTransaction, Account> = {
  name: "Ledger Live XRP — MPT tokens",

  setup: async () => {
    stopRemoteGuard = forbidRemoteRequests();
    holder = await newFundedWallet();
    issuer = await newFundedWallet();
    recipient = await newFundedWallet();

    issuanceA = await createMptIssuance(issuer, {
      assetScale: ASSET_SCALE,
      flags: TF_MPT_CAN_TRANSFER + TF_MPT_CAN_LOCK + TF_MPT_CAN_CLAWBACK,
      transferFee: TRANSFER_FEE,
    });
    issuanceB = await createMptIssuance(issuer, {
      assetScale: ASSET_SCALE,
      flags: TF_MPT_CAN_TRANSFER,
    });
    await authorizeMpt(recipient, issuanceA);
    await authorizeMpt(recipient, issuanceB);

    const mptA = makeMptToken(issuanceA, issuer.address, "MPTA", ASSET_SCALE);
    const mptB = makeMptToken(issuanceB, issuer.address, "MPTB", ASSET_SCALE);
    installTokenStore([mptA, mptB]);
    setLocalXrpConfig(["iou", "mpt"]);

    const { currencyBridge, accountBridge } = await getBridges(buildXrpSigner(holder));
    const account = makeXrpAccount(holder.address);
    mptAId = encodeTokenAccountId(account.id, mptA);
    mptBId = encodeTokenAccountId(account.id, mptB);
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
      await issue(issuer, holder.address, { mpt_issuance_id: issuanceA, value: "10000" });
      await issue(issuer, holder.address, { mpt_issuance_id: issuanceB, value: "5000" });
    }

    if (step === 4) {
      await clawbackMpt(issuer, { holder: holder.address, issuanceId: issuanceA, value: "500" });
    }

    if (step === 5) {
      await unauthorizeMpt(holder, issuanceA);
    }
  },

  afterAll: account => {
    expect(account.subAccounts).toHaveLength(2);
    expect(getSubAccount(account, mptBId).balance).toStrictEqual(units(4000));
    expect(getSubAccount(account, mptAId).balance.toFixed()).toBe("0");
    const count = (type: string) => account.operations.filter(op => op.type === type).length;
    expect(count("OPT_IN")).toBe(2);
    expect(count("OPT_OUT")).toBe(1);
    expect(count("FEES")).toBe(3);
  },

  teardown: () => {
    stopRemoteGuard?.();
  },
};
