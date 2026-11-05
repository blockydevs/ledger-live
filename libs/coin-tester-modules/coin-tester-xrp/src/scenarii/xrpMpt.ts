import BigNumber from "bignumber.js";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import type { Account } from "@ledgerhq/types-live";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { makeXrpAccount } from "../fixtures";
import { getBridges, createFundedWallet, setLocalXrpConfig } from "../helpers";
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
import { countOperations, expectSentByHolder, getSubAccount } from "./shared";

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

const ISSUE_STEP = 3;
const CLAWBACK_STEP = 4;
const OPT_OUT_STEP = 5;

/** MPT amounts are integers in base units. */
function toMptAmount(value: number): BigNumber {
  return new BigNumber(value);
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
      expect(current.operations.length - previous.operations.length).toBe(1);
      expect(latest.type).toBe("OPT_IN");
      expect(latest.hasFailed).toBe(false);
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
      expect(current.operations.length - previous.operations.length).toBe(1);
      expect(latest.type).toBe("OPT_IN");
      expect(latest.hasFailed).toBe(false);
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
    amount: toMptAmount(1000),
    expect: async (previous, current) => {
      for (const [id, held] of [
        [mptAId, 10_000],
        [mptBId, 5000],
      ] as const) {
        const [received] = getSubAccount(previous, id).operations;
        expect(received.type).toBe("IN");
        expect(received.senders).toContain(issuer.address);
        expect(getSubAccount(previous, id).balance).toStrictEqual(toMptAmount(held));
      }

      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, mptAId).balance).toStrictEqual(toMptAmount(8750));
      const sent = expectSentByHolder(previous, current, mptAId, { holder, recipient });
      // An op value is the holder's debit, transfer fee included: balance history depends on it.
      expect(sent.value).toStrictEqual(toMptAmount(1250));
      expect(await getMptBalance(recipient.address, issuanceA)).toBe("1000");
      expect(getSubAccount(current, mptBId).balance).toStrictEqual(toMptAmount(5000));
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
      expect(clawedBack.value).toStrictEqual(toMptAmount(500));
      expect(getSubAccount(previous, mptAId).balance).toStrictEqual(toMptAmount(8250));

      expect(current.subAccounts).toHaveLength(2);
      const sent = expectSentByHolder(previous, current, mptAId, { holder, recipient });
      expect(sent.value).toStrictEqual(toMptAmount(8250));
      expect(getSubAccount(current, mptAId).balance.toFixed()).toBe("0");
      // 1000 already held + 6600 delivered (8250 / 1.25).
      expect(await getMptBalance(recipient.address, issuanceA)).toBe("7600");
    },
  };

  const sendBAfterOptOut: XrpScenarioTransaction = {
    name: "Send 1000 B after an opt-out of A made outside Ledger Live",
    subAccountId: mptBId,
    assetReference: issuanceB,
    assetOwner: issuer.address,
    recipient: recipient.address,
    amount: toMptAmount(1000),
    expect: async (previous, current) => {
      const [optOut] = previous.operations;
      expect(optOut.type).toBe("OPT_OUT");
      expect(optOut.hasFailed).toBe(false);
      expect(optOut.senders).toEqual([holder.address]);
      expect(await getMptBalance(holder.address, issuanceA)).toBeUndefined();
      // The opt-out adds nothing to the A history and keeps what was there.
      const mptA = getSubAccount(previous, mptAId);
      expect(mptA.balance.toFixed()).toBe("0");
      expect(mptA.operations[0].value).toStrictEqual(toMptAmount(8250));

      expect(current.subAccounts).toHaveLength(2);
      expect(getSubAccount(current, mptBId).balance).toStrictEqual(toMptAmount(4000));
      const sent = expectSentByHolder(previous, current, mptBId, { holder, recipient });
      expect(sent.value).toStrictEqual(toMptAmount(1000));
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
    holder = await createFundedWallet();
    issuer = await createFundedWallet();
    recipient = await createFundedWallet();

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

    const mptA = makeMptToken({
      issuanceId: issuanceA,
      issuer: issuer.address,
      ticker: "MPTA",
      assetScale: ASSET_SCALE,
    });
    const mptB = makeMptToken({
      issuanceId: issuanceB,
      issuer: issuer.address,
      ticker: "MPTB",
      assetScale: ASSET_SCALE,
    });
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
    if (step === ISSUE_STEP) {
      await issue(issuer, holder.address, { mpt_issuance_id: issuanceA, value: "10000" });
      await issue(issuer, holder.address, { mpt_issuance_id: issuanceB, value: "5000" });
    }

    if (step === CLAWBACK_STEP) {
      await clawbackMpt(issuer, {
        holder: holder.address,
        issuanceId: issuanceA,
        value: "500",
      });
    }

    if (step === OPT_OUT_STEP) {
      await unauthorizeMpt(holder, issuanceA);
    }
  },

  afterAll: account => {
    expect(account.subAccounts).toHaveLength(2);
    expect(getSubAccount(account, mptBId).balance).toStrictEqual(toMptAmount(4000));
    expect(getSubAccount(account, mptAId).balance.toFixed()).toBe("0");
    expect(countOperations(account, "OPT_IN")).toBe(2);
    expect(countOperations(account, "OPT_OUT")).toBe(1);
    expect(countOperations(account, "FEES")).toBe(3);
  },

  teardown: () => {
    stopRemoteGuard?.();
  },
};
