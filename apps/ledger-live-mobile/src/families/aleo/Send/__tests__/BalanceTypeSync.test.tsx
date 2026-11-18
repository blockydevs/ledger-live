import React from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { act, render, screen } from "@tests/test-renderer";
import type { Account } from "@ledgerhq/types-live";
import type { AleoAccount, Transaction } from "@ledgerhq/live-common/families/aleo/types";
import { TRANSACTION_TYPE } from "@ledgerhq/live-common/families/aleo/constants";
import {
  ALEO_ACCOUNT_1,
  ALEO_TOKEN_ACCOUNT_1,
  makeAleoAccount,
} from "../../__mocks__/account.mock";
import { makeRecord } from "../../__mocks__/record.mock";
import { makeAleoTransaction, makePrivateAleoTransaction } from "../../__mocks__/transaction.mock";
import { useAleoPrivateSync } from "../../hooks/useAleoPrivateSync";
import { BalanceTypeSync } from "../BalanceTypeSync";

jest.mock("../../hooks/useAleoPrivateSync", () => ({
  useAleoPrivateSync: jest.fn(),
}));

const mockedUseAleoPrivateSync = jest.mocked(useAleoPrivateSync);
const mockStart = jest.fn();
const mockOnComplete = jest.fn();
const mockOnClose = jest.fn();

const ONE_ALEO = 1_000_000;

const publicTransaction = makeAleoTransaction({ mode: TRANSACTION_TYPE.TRANSFER_PUBLIC });
const privateTransaction = makePrivateAleoTransaction(0, null);

function mockSync(state: { progress?: number; isSyncing?: boolean; error?: Error | null } = {}) {
  mockedUseAleoPrivateSync.mockReturnValue({
    progress: state.progress ?? 0,
    isSyncing: state.isSyncing ?? true,
    error: state.error ?? null,
    start: mockStart,
    stop: jest.fn(),
  });
}

function withRecords(microcredits: number[]): AleoAccount {
  return makeAleoAccount({
    unspentPrivateRecords: microcredits.map(makeRecord),
    provableApi: { scannerStatus: { synced: true, percentage: 100 } },
  });
}

function completeSync(syncedAccount: Account) {
  const { onAccountUpdated } = mockedUseAleoPrivateSync.mock.calls.at(-1)![0];
  act(() => onAccountUpdated?.(syncedAccount));
}

function renderSync(transaction: Transaction, account: AleoAccount = ALEO_ACCOUNT_1) {
  return render(
    <BalanceTypeSync
      account={account}
      transaction={transaction}
      onComplete={mockOnComplete}
      onClose={mockOnClose}
    />,
  );
}

describe("BalanceTypeSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSync();
  });

  it("moves on straight away when the public balance is picked", () => {
    renderSync(publicTransaction);

    expect(mockedUseAleoPrivateSync).not.toHaveBeenCalled();
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it("syncs the private records and shows the progress", () => {
    mockSync({ progress: 42.4 });

    renderSync(privateTransaction);

    expect(mockedUseAleoPrivateSync).toHaveBeenCalledWith(
      expect.objectContaining({
        account: ALEO_ACCOUNT_1,
        autoStart: true,
        keepAliveOnUnmount: true,
      }),
    );
    expect(screen.getByText("Refreshing your private balance")).toBeOnTheScreen();
    expect(screen.getByText("42%")).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it("keeps the screen awake while syncing and lets it sleep once the sync fails", () => {
    const { rerender } = renderSync(privateTransaction);

    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
    expect(deactivateKeepAwake).not.toHaveBeenCalled();

    mockSync({ error: new Error("boom"), isSyncing: false });
    rerender(
      <BalanceTypeSync
        account={ALEO_ACCOUNT_1}
        transaction={privateTransaction}
        onComplete={mockOnComplete}
        onClose={mockOnClose}
      />,
    );

    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
  });

  it("offers to try again or to close the flow when the sync fails", async () => {
    mockSync({ error: new Error("boom"), isSyncing: false });

    const { user } = renderSync(privateTransaction);

    expect(screen.getByText("Private sync failed")).toBeOnTheScreen();
    await user.press(screen.getByText("Try again"));
    expect(mockStart).toHaveBeenCalledTimes(1);
    await user.press(screen.getByText("Cancel"));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it("moves on once synced when one transaction can use every record", () => {
    renderSync(privateTransaction);

    completeSync(withRecords(Array.from({ length: 14 }, () => ONE_ALEO)));

    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it("warns how much one transaction can send when the records exceed the limit", async () => {
    const { user } = renderSync(privateTransaction);

    completeSync(withRecords([...Array.from({ length: 14 }, () => ONE_ALEO), ONE_ALEO / 2]));

    expect(screen.getByText("You can send up to 14 ALEO")).toBeOnTheScreen();
    expect(screen.getByText(/one transaction can use a maximum of 14\./)).toBeOnTheScreen();
    expect(mockOnComplete).not.toHaveBeenCalled();
    await user.press(screen.getByText("Continue"));
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it("checks the token records of the synced account against the token limit", () => {
    const tokenAccount = {
      ...ALEO_TOKEN_ACCOUNT_1,
      unspentPrivateRecords: Array.from({ length: 14 }, () => makeRecord(ONE_ALEO)),
    };
    const tokenTransaction = makeAleoTransaction({
      mode: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
      subAccountId: tokenAccount.id,
      properties: { amountRecordCommitments: [], feeRecordCommitment: null },
    });

    renderSync(tokenTransaction);

    completeSync({ ...withRecords([]), subAccounts: [tokenAccount] });

    expect(screen.getByText("You can send up to 13 USAD")).toBeOnTheScreen();
    expect(screen.getByText(/one transaction can use a maximum of 13\./)).toBeOnTheScreen();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });
});
