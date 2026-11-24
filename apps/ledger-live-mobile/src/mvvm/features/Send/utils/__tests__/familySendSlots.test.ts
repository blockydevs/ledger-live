import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { Transaction } from "@ledgerhq/live-common/generated/types";
import {
  getSendBalanceTypeSync,
  isSendBalanceTypeSyncRequired,
  type SendBalanceTypeSync,
} from "../familySendSlots";

jest.mock("~/generated/SendBalanceTypeSync", () => ({
  __esModule: true,
  default: { evm: { isRequired: jest.fn(), Component: () => null } },
}));

const evmSlot: SendBalanceTypeSync = jest.requireMock("~/generated/SendBalanceTypeSync").default
  .evm;
const mockIsRequired = jest.mocked(evmSlot.isRequired);

const ETH_ACCOUNT = genAccount("family-send-slots-eth", {
  currency: getCryptoCurrencyById("ethereum"),
});
const BTC_ACCOUNT = genAccount("family-send-slots-btc", {
  currency: getCryptoCurrencyById("bitcoin"),
});

const evmTransaction = { family: "evm" } as Transaction;
const bitcoinTransaction = { family: "bitcoin" } as Transaction;

describe("familySendSlots", () => {
  beforeEach(() => {
    mockIsRequired.mockReset();
  });

  it.each([undefined, "bitcoin", "toString"])(
    "GIVEN the family %s without a sync slot WHEN resolved THEN no slot is returned",
    family => {
      expect(getSendBalanceTypeSync(family)).toBeUndefined();
    },
  );

  it("GIVEN a family without a sync slot WHEN checked THEN no sync is required", () => {
    expect(isSendBalanceTypeSyncRequired(BTC_ACCOUNT, bitcoinTransaction)).toBe(false);
  });

  it.each([true, false])(
    "GIVEN a family slot that returns %s WHEN checked THEN the slot decides",
    isRequired => {
      mockIsRequired.mockReturnValue(isRequired);

      expect(isSendBalanceTypeSyncRequired(ETH_ACCOUNT, evmTransaction)).toBe(isRequired);
      expect(mockIsRequired).toHaveBeenCalledTimes(1);
      expect(mockIsRequired).toHaveBeenCalledWith({
        account: ETH_ACCOUNT,
        transaction: evmTransaction,
      });
    },
  );
});
