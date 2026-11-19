import React from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { render, screen } from "@tests/test-renderer";
import { ALEO_ACCOUNT_1 } from "../__mocks__/account.mock";
import { makePrivateAleoTransaction } from "../__mocks__/transaction.mock";
import { useAleoPrivateSync } from "../hooks/useAleoPrivateSync";
import aleoSendBalanceTypeSync from "../SendBalanceTypeSync";

jest.mock("../hooks/useAleoPrivateSync", () => ({
  useAleoPrivateSync: jest.fn(),
}));

const mockedUseAleoPrivateSync = jest.mocked(useAleoPrivateSync);
const { Component: AleoSendBalanceTypeSync } = aleoSendBalanceTypeSync;

const privateTransaction = makePrivateAleoTransaction(0, null);

function mockSync(state: { progress?: number; isSyncing?: boolean; error?: Error | null } = {}) {
  mockedUseAleoPrivateSync.mockReturnValue({
    progress: state.progress ?? 0,
    isSyncing: state.isSyncing ?? true,
    error: state.error ?? null,
    start: jest.fn(),
    stop: jest.fn(),
  });
}

function SyncUnderTest() {
  return (
    <AleoSendBalanceTypeSync
      account={ALEO_ACCOUNT_1}
      transaction={privateTransaction}
      onComplete={jest.fn()}
      onClose={jest.fn()}
    />
  );
}

describe("AleoSendBalanceTypeSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSync();
  });

  it("rounds the sync progress to a whole percentage", () => {
    mockSync({ progress: 42.6 });

    render(<SyncUnderTest />);

    expect(screen.getByText("43%")).toBeVisible();
  });

  it("keeps the screen awake while syncing and lets it sleep once the sync fails", () => {
    const { rerender } = render(<SyncUnderTest />);

    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
    expect(deactivateKeepAwake).not.toHaveBeenCalled();

    mockSync({ error: new Error("boom"), isSyncing: false });
    rerender(<SyncUnderTest />);

    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
  });
});
