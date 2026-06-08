import React from "react";
import { render, screen, waitFor, withFlagOverrides } from "tests/testSetup";
import { useAccountPath } from "@ledgerhq/live-common/hooks/recoverFeatureFlag";
import { setRecoverState } from "~/renderer/reducers/recoverState";
import { LedgerRecoverSubscriptionStateEnum } from "~/types/recoverSubscriptionState";
import { isModalOpened } from "~/renderer/reducers/modals";
import { openURL } from "~/renderer/linking";
import { ContextMenu } from "LLD/features/MyWallet/components/ContextMenu";

const PROTECT_ID = "protect-id";
const RECOVER_HOME_PATH = "/recover/protect-id";

const mockNavigate = jest.fn();

jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  useNavigate: () => mockNavigate,
}));

jest.mock("@ledgerhq/live-common/hooks/recoverFeatureFlag", () => ({
  ...jest.requireActual("@ledgerhq/live-common/hooks/recoverFeatureFlag"),
  useAccountPath: jest.fn(),
}));

jest.mock("~/renderer/linking", () => ({
  openURL: jest.fn(),
}));

jest.mock("~/renderer/store", () => ({
  getStoreValue: jest.fn(),
  setStoreValue: jest.fn(),
  resetStore: jest.fn(),
}));

const mockOpenURL = jest.mocked(openURL);
const mockUseAccountPath = jest.mocked(useAccountPath);

const backupHubState = withFlagOverrides({
  protectServicesDesktop: {
    enabled: true,
    params: { protectId: PROTECT_ID, openRecoverFromSidebar: true },
  },
  lwdBackupHub: { enabled: true },
});

const openHub = async (options?: Parameters<typeof render>[1]) => {
  const utils = render(<ContextMenu />, { initialState: backupHubState, ...options });

  await utils.user.click(screen.getByRole("button", { name: "My Wallet" }));
  await waitFor(() => expect(screen.getByTestId("my-wallet-action-recover")).toBeVisible());
  await utils.user.click(screen.getByTestId("my-wallet-action-recover"));
  await waitFor(() => expect(screen.getByTestId("backup-hub")).toBeVisible());

  return utils;
};

describe("BackupHub", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAccountPath.mockReturnValue(undefined);
  });

  it("opens the Backup Hub inside the popover with the Recover and physical rows", async () => {
    await openHub();

    expect(screen.getByTestId("backup-hub-recover-row")).toBeVisible();
    expect(screen.getByTestId("backup-hub-physical-row-recovery-key")).toBeVisible();
    expect(screen.getByTestId("backup-hub-physical-row-secret-recovery-phrase")).toBeVisible();
  });

  it("shows the not-subscribed variant with a primary CTA by default", async () => {
    await openHub();

    expect(screen.getByRole("button", { name: "Discover" })).toBeVisible();
  });

  it("shows the done variant without a primary CTA", async () => {
    const utils = render(<ContextMenu />, { initialState: backupHubState });
    utils.store.dispatch(
      setRecoverState({
        protectId: PROTECT_ID,
        subscriptionState: LedgerRecoverSubscriptionStateEnum.BACKUP_DONE,
      }),
    );

    await utils.user.click(screen.getByRole("button", { name: "My Wallet" }));
    await utils.user.click(await screen.findByTestId("my-wallet-action-recover"));

    await waitFor(() => expect(screen.getByTestId("backup-hub")).toBeVisible());
    expect(screen.queryByRole("button", { name: "Discover" })).not.toBeInTheDocument();
  });

  it("shows the in-progress variant with the warning copy and no primary CTA", async () => {
    const utils = render(<ContextMenu />, { initialState: backupHubState });
    utils.store.dispatch(
      setRecoverState({
        protectId: PROTECT_ID,
        subscriptionState: LedgerRecoverSubscriptionStateEnum.BACKUP_DEVICE_CONNECTION,
      }),
    );

    await utils.user.click(screen.getByRole("button", { name: "My Wallet" }));
    await utils.user.click(await screen.findByTestId("my-wallet-action-recover"));

    await waitFor(() => expect(screen.getByTestId("backup-hub")).toBeVisible());
    expect(screen.getByText("Finish setting up your backup.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Discover" })).not.toBeInTheDocument();
  });

  it("navigates to the Recover Live App home when clicking the Recover row", async () => {
    mockUseAccountPath.mockReturnValue(RECOVER_HOME_PATH);

    const { user } = await openHub();

    await user.click(screen.getByTestId("backup-hub-recover-row"));

    expect(mockNavigate).toHaveBeenCalledWith(RECOVER_HOME_PATH);
    await waitFor(() => expect(screen.queryByTestId("backup-hub")).not.toBeInTheDocument());
  });

  it("falls back to MODAL_PROTECT_DISCOVER when no Live App path is available", async () => {
    const { user, store } = await openHub({
      initialState: withFlagOverrides({
        protectServicesDesktop: { enabled: true, params: { protectId: PROTECT_ID } },
        lwdBackupHub: { enabled: true },
      }),
    });

    await user.click(screen.getByTestId("backup-hub-recover-row"));

    expect(isModalOpened(store.getState(), "MODAL_PROTECT_DISCOVER")).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("opens the shop with UTM params when clicking a physical row", async () => {
    const { user } = await openHub();

    await user.click(screen.getByTestId("backup-hub-physical-row-recovery-key"));

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    const calledWith = mockOpenURL.mock.calls[0][0];
    expect(calledWith).toContain("https://shop.ledger.com/products/ledger-recovery-key");
    expect(calledWith).toContain("utm_source=lwd-backup-hub");
    expect(calledWith).toContain("utm_campaign=backup-hub-launch");
  });

  it("returns to the menu when pressing back", async () => {
    const { user } = await openHub();

    await user.click(screen.getByTestId("backup-hub-back"));

    await waitFor(() => expect(screen.getByTestId("my-wallet-actions-list")).toBeVisible());
    await waitFor(() => expect(screen.queryByTestId("backup-hub")).not.toBeInTheDocument());
  });
});
