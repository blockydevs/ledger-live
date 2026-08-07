import { toErrorRaw } from "@ledgerhq/ledger-wallet-framework/serialization/transaction";
import BigNumber from "bignumber.js";
import { fromTransactionRaw, fromTransactionStatusRaw, toTransactionRaw, toTransactionStatusRaw } from "./transaction";
import type { Transaction, TransactionRaw } from "./types";

describe("Hedera Family", () => {
  describe("transaction.ts", () => {
    const baseTx: Transaction = {
      family: "hedera",
      amount: new BigNumber(100),
      recipient: "0.0.1234",
      useAllAmount: false,
      mode: "send",
    };

    const baseRawTx: TransactionRaw = {
      family: "hedera",
      amount: "100",
      recipient: "0.0.1234",
      useAllAmount: false,
      mode: "send",
    };

    describe("fromTransactionRaw", () => {
      it("deserializes the common fields", () => {
        expect(fromTransactionRaw(baseRawTx)).toEqual(baseTx);
      });

      it("deserializes fees, gasLimit and nonce when present", () => {
        expect(
          fromTransactionRaw({
            ...baseRawTx,
            fees: "10",
            gasLimit: "21000",
            nonce: "0",
          }),
        ).toEqual({
          ...baseTx,
          fees: new BigNumber(10),
          gasLimit: new BigNumber(21000),
          nonce: new BigNumber(0),
        });
      });

      it("deserializes memoType, memoValue and valId when present", () => {
        expect(
          fromTransactionRaw({
            ...baseRawTx,
            mode: "delegate",
            memoType: "text",
            memoValue: "hello",
            valId: "3",
          }),
        ).toEqual({
          ...baseTx,
          mode: "delegate",
          memoType: "text",
          memoValue: "hello",
          valId: "3",
        });
      });

      it("deserializes assetReference and assetOwner when present", () => {
        expect(
          fromTransactionRaw({
            ...baseRawTx,
            assetReference: "0.0.5678",
            assetOwner: "0.0.9012",
          }),
        ).toEqual({
          ...baseTx,
          assetReference: "0.0.5678",
          assetOwner: "0.0.9012",
        });
      });

      it("does not set optional fields when absent from raw", () => {
        const tx = fromTransactionRaw(baseRawTx);
        expect(tx).not.toHaveProperty("fees");
        expect(tx).not.toHaveProperty("gasLimit");
        expect(tx).not.toHaveProperty("nonce");
        expect(tx).not.toHaveProperty("memoType");
        expect(tx).not.toHaveProperty("memoValue");
        expect(tx).not.toHaveProperty("valId");
        expect(tx).not.toHaveProperty("assetReference");
        expect(tx).not.toHaveProperty("assetOwner");
      });
    });

    describe("toTransactionRaw", () => {
      it("serializes the common fields", () => {
        expect(toTransactionRaw(baseTx)).toEqual(baseRawTx);
      });

      it("serializes fees, gasLimit and nonce when present", () => {
        expect(
          toTransactionRaw({
            ...baseTx,
            fees: new BigNumber(10),
            gasLimit: new BigNumber(21000),
            nonce: new BigNumber(0),
          }),
        ).toEqual({
          ...baseRawTx,
          fees: "10",
          gasLimit: "21000",
          nonce: "0",
        });
      });

      it("serializes memoType, memoValue and valId when present", () => {
        expect(
          toTransactionRaw({
            ...baseTx,
            mode: "delegate",
            memoType: "text",
            memoValue: "hello",
            valId: "3",
          }),
        ).toEqual({
          ...baseRawTx,
          mode: "delegate",
          memoType: "text",
          memoValue: "hello",
          valId: "3",
        });
      });

      it("serializes assetReference and assetOwner when present", () => {
        expect(
          toTransactionRaw({
            ...baseTx,
            assetReference: "0.0.5678",
            assetOwner: "0.0.9012",
          }),
        ).toEqual({
          ...baseRawTx,
          assetReference: "0.0.5678",
          assetOwner: "0.0.9012",
        });
      });

      it("does not set optional fields when absent from the transaction", () => {
        const raw = toTransactionRaw(baseTx);
        expect(raw).not.toHaveProperty("fees");
        expect(raw).not.toHaveProperty("gasLimit");
        expect(raw).not.toHaveProperty("nonce");
        expect(raw).not.toHaveProperty("memoType");
        expect(raw).not.toHaveProperty("memoValue");
        expect(raw).not.toHaveProperty("valId");
        expect(raw).not.toHaveProperty("assetReference");
        expect(raw).not.toHaveProperty("assetOwner");
      });
    });

    describe("fromTransactionStatusRaw / toTransactionStatusRaw", () => {
      it("round-trips a transaction status", () => {
        const err = new Error("Error Message");
        const warn = new Error("Warning Message");
        const rawStatus = {
          amount: "1",
          errors: { errorName: toErrorRaw(err) },
          warnings: { warningName: toErrorRaw(warn) },
          estimatedFees: "2",
          totalSpent: "4",
          recipientIsReadOnly: false,
        };

        const status = fromTransactionStatusRaw(rawStatus);
        expect(status).toEqual({
          amount: new BigNumber(1),
          errors: { errorName: err },
          warnings: { warningName: warn },
          estimatedFees: new BigNumber(2),
          totalSpent: new BigNumber(4),
          recipientIsReadOnly: false,
        });

        expect(toTransactionStatusRaw(status)).toEqual(rawStatus);
      });
    });
  });
});
