import type { Account } from "@ledgerhq/types-live";
import { postSync } from "./postSync";
import BigNumber from "bignumber.js";

describe("postSync", () => {
  it("removes confirmed and outdated native operations from the pending pool", () => {
    const initialAccount = {
      operations: [{ hash: "hash0", transactionSequenceNumber: new BigNumber(4), type: "OUT" }],
      pendingOperations: [
        { hash: "outdated", transactionSequenceNumber: new BigNumber(3), type: "IN" },
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "OUT" },
        { hash: "hash2", transactionSequenceNumber: new BigNumber(6), type: "IN" },
      ],
    } as Account;
    const synced = {
      operations: [
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "OUT" },
        { hash: "hash0", transactionSequenceNumber: new BigNumber(4), type: "OUT" },
      ],
      pendingOperations: [
        { hash: "outdated", transactionSequenceNumber: new BigNumber(3), type: "IN" },
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "OUT" },
        { hash: "hash2", transactionSequenceNumber: new BigNumber(6), type: "IN" },
      ],
    } as Account;

    expect(postSync(initialAccount, synced)).toMatchObject({
      operations: [
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "OUT" },
        { hash: "hash0", transactionSequenceNumber: new BigNumber(4), type: "OUT" },
      ],
      pendingOperations: [
        { hash: "hash2", transactionSequenceNumber: new BigNumber(6), type: "IN" },
      ],
    });
  });

  it("removes confirmed and outdated token operations from the pending pool", () => {
    const initialAccount = {
      operations: [{ hash: "hash0", transactionSequenceNumber: new BigNumber(4), type: "OUT" }],
      pendingOperations: [
        { hash: "outdated", transactionSequenceNumber: new BigNumber(3), type: "NONE" },
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "FEES" },
        { hash: "hash2", transactionSequenceNumber: new BigNumber(6), type: "IN" },
      ],
      subAccounts: [
        {
          pendingOperations: [
            { hash: "outdated", transactionSequenceNumber: new BigNumber(3), type: "IN" },
            { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "FEES" },
          ],
        },
      ],
    } as Account;
    const synced = {
      operations: [
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "FEES" },
        { hash: "hash0", transactionSequenceNumber: new BigNumber(4), type: "OUT" },
      ],
      pendingOperations: [
        { hash: "outdated", transactionSequenceNumber: new BigNumber(3), type: "NONE" },
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "FEES" },
        { hash: "hash2", transactionSequenceNumber: new BigNumber(6), type: "IN" },
      ],
      subAccounts: [
        {
          operations: [{ hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "OUT" }],
          pendingOperations: [
            { hash: "outdated", transactionSequenceNumber: new BigNumber(3), type: "IN" },
          ],
        },
      ],
    } as Account;

    expect(postSync(initialAccount, synced)).toMatchObject({
      operations: [
        { hash: "hash1", transactionSequenceNumber: new BigNumber(5), type: "FEES" },
        { hash: "hash0", transactionSequenceNumber: new BigNumber(4), type: "OUT" },
      ],
      pendingOperations: [
        { hash: "hash2", transactionSequenceNumber: new BigNumber(6), type: "IN" },
      ],
      subAccounts: [
        {
          operations: [
            {
              hash: "hash1",
              transactionSequenceNumber: new BigNumber(5),
              type: "OUT",
            },
          ],
          pendingOperations: [],
        },
      ],
    });
  });

  it("keeps a hedera-shaped pending op: sequence 0 against synced ops with no sequence", () => {
    const pending = {
      hash: "0.0.4@1753600000.000000001",
      type: "OUT",
      transactionSequenceNumber: new BigNumber(0),
    } as unknown as Account["pendingOperations"][number];
    const initialAccount = {
      operations: [],
      pendingOperations: [pending],
    } as unknown as Account;
    const synced = {
      operations: [
        { hash: "0.0.4@1753500000.000000001", type: "OUT", transactionSequenceNumber: undefined },
      ],
      pendingOperations: [],
    } as unknown as Account;

    expect(postSync(initialAccount, synced).pendingOperations).toHaveLength(1);
  });

  it("drops a hedera-shaped pending op once its hash appears in the synced list", () => {
    const hash = "0.0.4@1753600000.000000001";
    const pending = {
      hash,
      type: "OUT",
      transactionSequenceNumber: new BigNumber(0),
    } as unknown as Account["pendingOperations"][number];
    const initialAccount = {
      operations: [],
      pendingOperations: [pending],
    } as unknown as Account;
    const synced = {
      operations: [{ hash, type: "OUT", transactionSequenceNumber: undefined }],
      pendingOperations: [],
    } as unknown as Account;

    expect(postSync(initialAccount, synced).pendingOperations).toHaveLength(0);
  });
});
