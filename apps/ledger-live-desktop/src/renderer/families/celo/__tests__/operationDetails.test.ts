import BigNumber from "bignumber.js";
import { getCryptoCurrencyById } from "@ledgerhq/live-common/currencies/index";
import { emptyHistoryCache } from "@ledgerhq/ledger-wallet-framework/account/index";
import type { CryptoCurrency, TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { CeloAccount, CeloOperation } from "@ledgerhq/live-common/families/celo/types";
import operationDetails from "../operationDetails";

const { getDisplayFee } = operationDetails;

const celo = getCryptoCurrencyById("celo");

const buildOperation = (feeWei: string): CeloOperation => ({
  id: "celo:test-op",
  hash: "0xhash",
  type: "OUT",
  value: new BigNumber(0),
  fee: new BigNumber(feeWei),
  senders: [],
  recipients: [],
  blockHeight: 100,
  blockHash: null,
  accountId: "celo:test-account",
  date: new Date("2026-01-01"),
  hasFailed: false,
  extra: {},
});

const buildAccount = (): CeloAccount => ({
  type: "Account",
  id: "celo:test-account",
  seedIdentifier: "seed",
  derivationMode: "",
  index: 0,
  freshAddress: "0xabc",
  freshAddressPath: "44'/52752'/0'/0/0",
  used: true,
  balance: new BigNumber(0),
  spendableBalance: new BigNumber(0),
  creationDate: new Date("2026-01-01"),
  blockHeight: 100,
  currency: celo,
  operationsCount: 0,
  operations: [],
  pendingOperations: [],
  lastSyncDate: new Date("2026-01-01"),
  balanceHistoryCache: emptyHistoryCache,
  swapHistory: [],
  celoResources: {
    registrationStatus: false,
    lockedBalance: new BigNumber(0),
    nonvotingLockedBalance: new BigNumber(0),
    pendingWithdrawals: null,
    votes: null,
    electionAddress: null,
    lockedGoldAddress: null,
    maxNumGroupsVotedFor: new BigNumber(0),
  },
});

const buildToken = (magnitude: number): TokenCurrency => ({
  type: "TokenCurrency",
  id: "celo/erc20/test",
  contractAddress: "0xc0ffee0000000000000000000000000000000001",
  parentCurrency: celo,
  tokenType: "erc20",
  name: "Test Token",
  ticker: "TST",
  units: [{ name: "Test Token", code: "TST", magnitude }],
});

describe("celo desktop operationDetails.getDisplayFee", () => {
  const account = buildAccount();

  it("returns undefined for a native CryptoCurrency", () => {
    const op = buildOperation("1000000000000000000");
    expect(getDisplayFee(op, account, celo)).toBeUndefined();
  });

  it("returns undefined when the token magnitude is exactly 18", () => {
    const op = buildOperation("1000000000000000000");
    expect(getDisplayFee(op, account, buildToken(18))).toBeUndefined();
  });

  it("returns undefined when the token magnitude is missing", () => {
    const op = buildOperation("1000000000000000000");
    const token: TokenCurrency = { ...buildToken(6), units: [] };
    expect(getDisplayFee(op, account, token)).toBeUndefined();
  });

  it("rescales a 6-decimal token fee from 18-decimal units (USDC-like)", () => {
    // 1 USDC at 18-decimal normalisation = 1e18; rescaled = 1e6.
    const op = buildOperation("1000000000000000000");
    expect(getDisplayFee(op, account, buildToken(6))?.toFixed()).toBe("1000000");
  });

  it("floors the result for non-exact divisions", () => {
    // For magnitude 6 the divisor is 1e12; (1e12 + 1) / 1e12 = 1.000…001 → 1.
    const op = buildOperation("1000000000001");
    expect(getDisplayFee(op, account, buildToken(6))?.toFixed()).toBe("1");
  });

  it("rescales an 8-decimal token fee correctly", () => {
    const op = buildOperation("500000000000000000"); // 0.5e18
    // 0.5e18 / 1e10 = 5e7
    expect(getDisplayFee(op, account, buildToken(8))?.toFixed()).toBe("50000000");
  });
});
