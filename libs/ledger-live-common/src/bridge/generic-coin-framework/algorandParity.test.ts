import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { TokenCurrency } from "@domain/entity-currency-token";
import { createApi } from "@ledgerhq/coin-algorand/api";
import type { AlgorandContext } from "@ledgerhq/coin-algorand/config";
import {
  AlgoTransactionType,
  getAccount,
  getAccountTransactions,
} from "@ledgerhq/coin-algorand/network";
import network from "@ledgerhq/live-network";
import type { Account, TokenAccount } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { applyMemoToTransaction } from "../descriptor/send/memo";
import { getCoinModuleApi } from "./api";
import { buildSubAccounts } from "./buildSubAccounts";
import { genericPrepareTransaction } from "./prepareTransaction";
import type { GenericTransaction, OperationCommon } from "./types";
import { adaptCoreOperationToLiveOperation } from "./utils";

jest.mock("@ledgerhq/live-network", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@ledgerhq/coin-algorand/network", () => ({
  ...jest.requireActual("@ledgerhq/coin-algorand/network"),
  getAccount: jest.fn(),
  getAccountTransactions: jest.fn(),
}));
jest.mock("./api", () => ({ getCoinModuleApi: jest.fn() }));

const SENDER = "SENDER_ADDRESS";
const RECIPIENT = "RECIPIENT_ADDRESS";
const ASA_ID = "31566704";
const currency = getCryptoCurrencyById("algorand");
const context = {
  config: async () => ({ node: "https://node.test", indexer: "https://indexer.test" }),
  logger: jest.fn(),
} as unknown as AlgorandContext;

const asaToken = {
  type: "TokenCurrency",
  id: `algorand/asa/${ASA_ID}`,
  contractAddress: ASA_ID,
  parentCurrencyId: currency.id,
  tokenType: "asa",
  name: "USDC",
  ticker: "USDC",
  units: [{ name: "USDC", code: "USDC", magnitude: 6 }],
} as unknown as TokenCurrency;

const asaSubAccount = {
  type: "TokenAccount",
  id: "algorand-parity+asa",
  token: asaToken,
  spendableBalance: new BigNumber(500),
} as TokenAccount;

const account = {
  id: "algorand-parity",
  currency,
  freshAddress: SENDER,
  xpub: "",
  subAccounts: [asaSubAccount],
  pendingOperations: [],
} as unknown as Account;

async function prepareAndCaptureIntent(transaction: GenericTransaction) {
  const estimateFees = jest.fn().mockResolvedValue({ value: 1000n });
  jest.mocked(getCoinModuleApi).mockResolvedValue({
    estimateFees,
    craftTransactionData: jest.fn(),
  } as unknown as Awaited<ReturnType<typeof getCoinModuleApi>>);

  await genericPrepareTransaction("algorand", "local")(account, transaction);

  expect(estimateFees).toHaveBeenCalledTimes(1);
  return estimateFees.mock.calls[0][1];
}

function makeSendTransaction(fields: Partial<GenericTransaction>): GenericTransaction {
  return {
    family: "algorand",
    mode: "send",
    amount: new BigNumber(100),
    recipient: RECIPIENT,
    fees: null,
    ...fields,
  } as GenericTransaction;
}

describe("Algorand on the generic adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("drops the note written by the send flow", async () => {
    const intent = await prepareAndCaptureIntent(
      makeSendTransaction(applyMemoToTransaction("algorand", "hello")),
    );

    // LIVE-35921 flips this to: expect(intent.memo).toEqual({ type: "string", kind: "note", value: "hello" });
    expect(intent.memo).toEqual({ type: "none" });
  });

  it("sends an ASA as the native asset", async () => {
    const intent = await prepareAndCaptureIntent(
      makeSendTransaction({ subAccountId: asaSubAccount.id }),
    );

    // LIVE-35919 flips this to: expect(intent.asset).toEqual({ type: "asa", assetReference: ASA_ID, assetOwner: SENDER });
    expect(intent.asset).toEqual({ type: "native" });
  });

  it("resolves the local API to the coin service on 0.0.0.0:3000", async () => {
    const { getCoinModuleApi: resolveApi } = jest.requireActual<typeof import("./api")>("./api");
    jest.mocked(network).mockRejectedValue(new Error("offline"));

    const api = await resolveApi("algorand", "local");

    await expect(api.lastBlock(context)).rejects.toThrow("offline");

    // LIVE-35919 flips this to: expect.stringMatching(/^https:\/\/node\.test\//)
    const url = expect.stringMatching(/^http:\/\/0\.0\.0\.0:3000\//);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledWith(expect.objectContaining({ url }));
  });

  it("builds the ASA sub-account from its balance, with an empty history", async () => {
    jest.mocked(getAccount).mockResolvedValue({
      address: SENDER,
      round: 1000,
      balance: new BigNumber(1_000_000),
      pendingRewards: new BigNumber(0),
      assets: [{ assetId: ASA_ID, balance: new BigNumber(500) }],
    });
    jest.mocked(getAccountTransactions).mockResolvedValue({
      transactions: [
        {
          id: "TX_ASA",
          rootId: "TX_ASA",
          type: AlgoTransactionType.ASSET_TRANSFER,
          senderAddress: RECIPIENT,
          feesPayer: RECIPIENT,
          fee: new BigNumber(1000),
          round: 1000,
          timestamp: "1700000000",
          note: "",
          senderRewards: new BigNumber(0),
          recipientRewards: new BigNumber(0),
          closeRewards: undefined,
          closeAmount: undefined,
          details: {
            assetAmount: new BigNumber(500),
            assetSenderAddress: undefined,
            assetRecipientAddress: SENDER,
            assetId: ASA_ID,
            assetCloseToAddress: undefined,
            assetCloseAmount: undefined,
          },
        },
      ],
      nextToken: undefined,
    });
    const api = createApi();
    const balances = await api.getBalance(context, SENDER);
    const page = await api.listOperations(context, SENDER, { minHeight: 0, order: "desc" });

    const subAccounts = await buildSubAccounts({
      accountId: account.id,
      allTokenAssetsBalances: balances.filter(balance => balance.asset.type !== "native"),
      syncConfig: { paginationConfig: {} },
      operations: page.items.map(op =>
        adaptCoreOperationToLiveOperation(account.id, op),
      ) as OperationCommon[],
      getTokenFromAsset: async () => asaToken,
    });

    expect(subAccounts).toEqual([
      // LIVE-35919 flips this to: operationsCount: 1
      expect.objectContaining({ balance: new BigNumber(500), operationsCount: 0 }),
    ]);
  });
});
