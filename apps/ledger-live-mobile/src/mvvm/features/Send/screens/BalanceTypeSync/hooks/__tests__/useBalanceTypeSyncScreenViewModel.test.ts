import { genAccount, genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { TokenCurrency } from "@domain/entity-currency-token";
import type { Transaction } from "@ledgerhq/live-common/generated/types";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import { renderHook } from "@tests/test-renderer";
import { useSendFlowData } from "../../../../context/SendFlowContext";
import { getSendBalanceTypeSync } from "../../../../utils/familySendSlots";
import { useBalanceTypeSyncScreenViewModel } from "../useBalanceTypeSyncScreenViewModel";

jest.mock("../../../../context/SendFlowContext");
jest.mock("../../../../utils/familySendSlots", () => ({
  getSendBalanceTypeSync: jest.fn(),
}));

const MockSyncComponent = () => null;

const mockedUseSendFlowData = jest.mocked(useSendFlowData);
const mockedGetSendBalanceTypeSync = jest.mocked(getSendBalanceTypeSync);

const ethereum = getCryptoCurrencyById("ethereum");
const account = genAccount("balance-type-sync-account", { currency: ethereum });
const usdt = {
  type: "TokenCurrency",
  id: "ethereum/erc20/usd_tether__erc20_",
  parentCurrencyId: ethereum.id,
  tokenType: "erc20",
  ticker: "USDT",
  units: [{ name: "Tether USD", code: "USDT", magnitude: 6 }],
} as unknown as TokenCurrency;
const tokenAccount = genTokenAccount(0, account, usdt);
const transaction = { family: "evm" } as Transaction;

function mockFlowState(flowAccount: AccountLike = account, parentAccount: Account | null = null) {
  mockedUseSendFlowData.mockReturnValue({
    state: { account: { account: flowAccount, parentAccount }, transaction: { transaction } },
  } as never);
}

function renderViewModel() {
  return renderHook(() => useBalanceTypeSyncScreenViewModel());
}

describe("useBalanceTypeSyncScreenViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSendBalanceTypeSync.mockReturnValue({
      isRequired: jest.fn(() => true),
      Component: MockSyncComponent,
    });
    mockFlowState();
  });

  it("GIVEN a family without a balance type sync WHEN rendered THEN the view model is not ready", () => {
    mockedGetSendBalanceTypeSync.mockReturnValue(undefined);

    const { result } = renderViewModel();

    expect(result.current.ready).toBe(false);
  });

  it("GIVEN a token account WHEN rendered THEN its component gets the parent account", () => {
    mockFlowState(tokenAccount, account);

    const { result } = renderViewModel();

    expect(result.current).toMatchObject({ ready: true, account });
  });
});
