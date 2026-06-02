import { act } from "react";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { genAccount } from "@ledgerhq/live-common/mock/account";
import * as walletPnlHooks from "@ledgerhq/wallet-pnl/hooks";
import { renderHook, withFlagOverrides } from "@tests/test-renderer";
import { State } from "~/reducers/types";
import { usePnlSectionViewModel } from "../usePnlSectionViewModel";

const btcAccount = genAccount("btc-1", {
  currency: getCryptoCurrencyById("bitcoin"),
  operationsSize: 0,
});

const withAccounts = (state: State): State => ({
  ...state,
  accounts: { ...state.accounts, active: [btcAccount] },
});

const withDiscreet =
  (discreetMode: boolean) =>
  (state: State): State => ({
    ...state,
    settings: { ...state.settings, discreetMode },
  });

const compose =
  (...transforms: Array<(state: State) => State>) =>
  (state: State): State =>
    transforms.reduce((acc, t) => t(acc), state);

const withPnl = (enabled: boolean) =>
  compose(
    withAccounts,
    withFlagOverrides({ lwmWallet40: { enabled: true, params: { pnl: enabled } } }),
  );

describe("usePnlSectionViewModel", () => {
  it("keeps the detail drawer closed by default", () => {
    const { result } = renderHook(() => usePnlSectionViewModel(), {
      overrideInitialState: withPnl(true),
    });

    expect(result.current.drawer.isOpen).toBe(false);
  });

  it("opens the detail drawer when the title press handler runs", () => {
    const { result } = renderHook(() => usePnlSectionViewModel(), {
      overrideInitialState: withPnl(true),
    });

    act(() => result.current.openDrawer());

    expect(result.current.drawer.isOpen).toBe(true);
  });

  it("closes the detail drawer when its onClose runs", () => {
    const { result } = renderHook(() => usePnlSectionViewModel(), {
      overrideInitialState: withPnl(true),
    });

    act(() => result.current.openDrawer());
    expect(result.current.drawer.isOpen).toBe(true);

    act(() => result.current.drawer.onClose());
    expect(result.current.drawer.isOpen).toBe(false);
  });

  it("exposes an unrealised and a realised return card", () => {
    const { result } = renderHook(() => usePnlSectionViewModel(), {
      overrideInitialState: withPnl(true),
    });

    expect(result.current.unrealised.title).toBe("Unrealised return");
    expect(result.current.realised.title).toBe("Realised return");
    expect(result.current.unrealised.value).toBeTruthy();
    expect(result.current.realised.value).toBeTruthy();
  });

  describe("rendering gate", () => {
    it("disables the section when there are no accounts even if the flag is on", () => {
      const { result } = renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: withFlagOverrides({
          lwmWallet40: { enabled: true, params: { pnl: true } },
        }),
      });

      expect(result.current.shouldDisplayPnl).toBe(false);
    });

    it("enables the section when the flag is on and there are accounts", () => {
      const { result } = renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: withPnl(true),
      });

      expect(result.current.shouldDisplayPnl).toBe(true);
    });
  });

  describe("discreet mode", () => {
    it("masks card values when discreet mode is on", () => {
      const { result } = renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: compose(withPnl(true), withDiscreet(true)),
      });

      expect(result.current.unrealised.value).toContain("***");
      expect(result.current.realised.value).toContain("***");
    });

    it("masks every drawer item value when discreet mode is on", () => {
      const { result } = renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: compose(withPnl(true), withDiscreet(true)),
      });

      for (const item of result.current.drawer.items) {
        expect(item.value).toContain("***");
      }
    });

    it("does not mask values when discreet mode is off", () => {
      const { result } = renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: compose(withPnl(true), withDiscreet(false)),
      });

      expect(result.current.unrealised.value).not.toContain("***");
      expect(result.current.realised.value).not.toContain("***");
      for (const item of result.current.drawer.items) {
        expect(item.value).not.toContain("***");
      }
    });
  });

  describe("usePortfolioPnL short-circuit", () => {
    let spy: jest.SpyInstance<
      ReturnType<typeof walletPnlHooks.usePortfolioPnL>,
      Parameters<typeof walletPnlHooks.usePortfolioPnL>
    >;

    beforeEach(() => {
      spy = jest.spyOn(walletPnlHooks, "usePortfolioPnL");
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it("passes an empty accounts list to usePortfolioPnL when the flag is off", () => {
      renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: withPnl(false),
      });

      expect(spy).toHaveBeenCalledWith([], expect.anything(), expect.anything());
    });

    it("forwards the real accounts to usePortfolioPnL when the flag is on", () => {
      renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: withPnl(true),
      });

      const [accountsArg] = spy.mock.calls[0];
      expect(Array.isArray(accountsArg)).toBe(true);
      expect((accountsArg as unknown[]).length).toBeGreaterThan(0);
    });

    it("falls back to zero returns when usePortfolioPnL returns an empty object", () => {
      // @ts-expect-error mockReturnValue expects a PortfolioPnL, but we're returning an empty object
      spy.mockReturnValue({});

      const { result } = renderHook(() => usePnlSectionViewModel(), {
        overrideInitialState: withPnl(true),
      });

      expect(result.current.unrealised.value).toMatch(/0(?:[.,]00)?/);
      expect(result.current.realised.value).toMatch(/0(?:[.,]00)?/);
    });
  });
});
