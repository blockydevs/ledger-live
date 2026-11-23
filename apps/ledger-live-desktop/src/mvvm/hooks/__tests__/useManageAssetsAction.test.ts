import { renderHook, waitFor } from "tests/testSetup";
import { importLLDCoinFamily } from "~/renderer/families";
import { clearLLDCoinFamilyCache } from "~/renderer/families/registry";
import { ETH_ACCOUNT, XRP_ACCOUNT } from "LLD/features/__mocks__/accounts.mock";
import { useManageAssetsAction } from "../useManageAssetsAction";

const mockImportXrpFamily = jest.fn();

jest.mock("~/renderer/families/loaders", () => ({
  lldFamilyLoaders: [{ family: "xrp", importFamily: () => mockImportXrpFamily() }],
}));

function xrpFamilyThatCanManage(canManage: boolean) {
  const manageAssetsAction = { canManage: () => canManage, open: jest.fn() };
  mockImportXrpFamily.mockResolvedValue({ default: { manageAssetsAction } });

  return manageAssetsAction;
}

describe("useManageAssetsAction", () => {
  beforeEach(() => {
    clearLLDCoinFamilyCache("xrp");
  });

  it("returns no action while the family loads, then the family's action", async () => {
    const manageAssetsAction = xrpFamilyThatCanManage(true);

    const { result } = renderHook(() => useManageAssetsAction(XRP_ACCOUNT));
    expect(result.current).toBeUndefined();

    await waitFor(() => expect(result.current).toBeInstanceOf(Function));

    result.current?.();
    expect(manageAssetsAction.open).toHaveBeenCalledTimes(1);
    expect(manageAssetsAction.open).toHaveBeenCalledWith(
      expect.objectContaining({ account: XRP_ACCOUNT }),
    );
  });

  it("returns no action when the family cannot manage the account", async () => {
    xrpFamilyThatCanManage(false);
    await importLLDCoinFamily("xrp");

    const { result } = renderHook(() => useManageAssetsAction(XRP_ACCOUNT));

    expect(result.current).toBeUndefined();
  });

  it("returns no action for an account of another family", async () => {
    xrpFamilyThatCanManage(true);
    await importLLDCoinFamily("xrp");

    const { result } = renderHook(() => useManageAssetsAction(ETH_ACCOUNT));

    expect(result.current).toBeUndefined();
  });
});
