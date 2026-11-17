import { act, renderHook } from "@testing-library/react-native";
import type { BalanceTypeSelfTransferTarget } from "@ledgerhq/live-common/bridge/descriptor/types";
import { useSelfTransferSectionViewModel } from "../useSelfTransferSectionViewModel";

jest.mock("~/context/Locale", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const toPrivateTarget: BalanceTypeSelfTransferTarget = {
  address: "aleo1self",
  translationKey: "recipient.selfTransfer.toPrivate",
  isDestinationPublic: false,
};

describe("useSelfTransferSectionViewModel", () => {
  it("offers no section without a self-transfer target", () => {
    const { result } = renderHook(() =>
      useSelfTransferSectionViewModel({ target: null, onAddressSelected: jest.fn() }),
    );

    expect(result.current).toBeNull();
  });

  it("names the destination pool", () => {
    const { result } = renderHook(() =>
      useSelfTransferSectionViewModel({ target: toPrivateTarget, onAddressSelected: jest.fn() }),
    );

    expect(result.current).toMatchObject({
      title: "send.newSendFlow.recipient.selfTransfer.title",
      actionLabel: "send.newSendFlow.recipient.selfTransfer.toPrivate.action",
      isDestinationPublic: false,
    });
  });

  it("selects the target address when pressed", () => {
    const onAddressSelected = jest.fn();
    const { result } = renderHook(() =>
      useSelfTransferSectionViewModel({ target: toPrivateTarget, onAddressSelected }),
    );

    act(() => result.current?.onPress());

    expect(onAddressSelected).toHaveBeenCalledTimes(1);
    expect(onAddressSelected).toHaveBeenCalledWith("aleo1self");
  });
});
