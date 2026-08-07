import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { Account } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { createTransaction } from "./createTransaction";

describe("createTransaction", () => {
  it("returns the Cardano default transaction with a zero nonce", () => {
    const account = {
      type: "Account",
      currency: getCryptoCurrencyById("cardano"),
    } as unknown as Account;

    expect(createTransaction(account)).toEqual({
      family: "cardano",
      amount: new BigNumber(0),
      recipient: "",
      fees: null,
      useAllAmount: false,
      mode: "send",
      nonce: new BigNumber(0),
    });
  });

  it("returns the Tron default native send transaction", () => {
    const account = {
      type: "Account",
      currency: getCryptoCurrencyById("tron"),
    } as unknown as Account;

    expect(createTransaction(account)).toEqual({
      family: "tron",
      amount: new BigNumber(0),
      recipient: "",
      fees: null,
      useAllAmount: false,
      mode: "send",
    });
  });

  it("returns the VeChain default native send transaction with a zero nonce", () => {
    const account = {
      type: "Account",
      currency: getCryptoCurrencyById("vechain"),
    } as unknown as Account;

    expect(createTransaction(account)).toEqual({
      family: "vechain",
      amount: new BigNumber(0),
      recipient: "",
      fees: null,
      useAllAmount: false,
      mode: "send",
      nonce: new BigNumber(0),
    });
  });

  it("throws for an unsupported currency family", () => {
    const account = {
      type: "Account",
      currency: { family: "not-a-real-family" },
    } as unknown as Account;

    expect(() => createTransaction(account)).toThrow(
      "Unsupported currency family: not-a-real-family",
    );
  });

  it("returns a send-mode transaction with no network-specific defaults for hedera", () => {
    const account = {
      type: "Account",
      currency: { family: "hedera" },
    } as never;

    const transaction = createTransaction(account);

    expect(transaction).toMatchObject({
      family: "hedera",
      mode: "send",
      recipient: "",
      useAllAmount: false,
    });
  });

  it("gives hedera a nonce so signOperation never calls getNextSequence", () => {
    const account = {
      type: "Account",
      currency: getCryptoCurrencyById("hedera"),
    } as unknown as Account;

    const transaction = createTransaction(account);

    expect(transaction.nonce).toEqual(new BigNumber(0));
  });
});
