import type { BalanceTypeSelfTransferTarget } from "@ledgerhq/live-common/bridge/descriptor/types";
import type { AddressSearchResult } from "@ledgerhq/live-common/flows/send/recipient/types";
import type { Account } from "@ledgerhq/types-live";
import { renderHook } from "@testing-library/react-native";
import { ContactsI18nTestProvider } from "@features/platform-contacts/testing";
import { useAddressMatchedSectionViewModel } from "../useAddressMatchedSectionViewModel";

jest.mock("@features/platform-feature-flags", () => ({
  useFeature: () => ({ enabled: false }),
}));

jest.mock("~/context/Locale", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("~/context/hooks", () => ({
  useSelector: () => "en",
}));

const address = "aleo1self";
const poolLabel = "send.newSendFlow.recipient.selfTransfer.toPrivate.label";

const toPrivateTarget: BalanceTypeSelfTransferTarget = {
  address: address.toUpperCase(),
  translationKey: "recipient.selfTransfer.toPrivate",
  isDestinationPublic: false,
};

const searchResult: AddressSearchResult = {
  status: "valid",
  error: null,
  resolvedAddress: address,
  ensName: undefined,
  isLedgerAccount: true,
  accountName: undefined,
  accountBalance: undefined,
  accountBalanceFormatted: undefined,
  isFirstInteraction: false,
  matchedRecentAddress: undefined,
  matchedAccounts: [],
  matchedContact: undefined,
  bridgeErrors: undefined,
  bridgeWarnings: undefined,
  hasBridgeValidationResult: true,
};

describe("useAddressMatchedSectionViewModel", () => {
  it("names the matched account after the pool when contacts are disabled", () => {
    const account = { id: "aleo-account", freshAddress: address } as Account;

    const { result } = renderHook(
      () =>
        useAddressMatchedSectionViewModel({
          searchResult: {
            ...searchResult,
            matchedAccounts: [
              {
                account,
                accountName: undefined,
                accountBalance: undefined,
                accountBalanceFormatted: undefined,
              },
            ],
          },
          selfTransferTarget: toPrivateTarget,
          searchValue: address,
          onSelect: jest.fn(),
          isAddressComplete: true,
        }),
      { wrapper: ContactsI18nTestProvider },
    );

    expect(result.current.suggestion).toMatchObject({
      kind: "matched-ledger-accounts",
      matchedAccounts: [{ account, accountName: poolLabel }],
    });
  });
});
