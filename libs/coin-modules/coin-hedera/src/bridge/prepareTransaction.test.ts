import BigNumber from "bignumber.js";
import * as liveEnv from "@ledgerhq/live-env";
import * as utils from "./utils";
import { prepareTransaction } from "./prepareTransaction";
import { HederaAccount, Transaction } from "../types";

jest.mock("@ledgerhq/live-env");

describe("prepareTransaction", () => {
  const mockAccount = {
    id: "hedera:0:testAccount",
    freshAddress: "0.0.123",
    spendableBalance: new BigNumber(1000000),
    currency: { id: "hedera" },
  } as HederaAccount;

  const mockStakingTx = {
    family: "hedera",
    amount: new BigNumber(0),
    recipient: "",
    useAllAmount: false,
    properties: {
      name: "staking",
      mode: "delegation",
    },
  } as Transaction;

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(utils, "getEstimatedFees").mockResolvedValue(Promise.resolve(new BigNumber(10)));
    jest
      .spyOn(utils, "calculateAmount")
      .mockResolvedValue(
        Promise.resolve({ amount: new BigNumber(100), totalSpent: new BigNumber(100) }),
      );
  });

  test("should set amount and maxFee from utils", async () => {
    const mockTx = { ...mockStakingTx };
    const result = await prepareTransaction(mockAccount, mockTx);
    expect(result.amount.isEqualTo(new BigNumber(100))).toBe(true);
    expect(result.maxFee?.isEqualTo(new BigNumber(10))).toBe(true);
  });

  test("should set recipient and amount for claimRewards mode", async () => {
    jest.spyOn(liveEnv, "getEnv").mockReturnValue("0.0.reward");
    const mockTx = {
      ...mockStakingTx,
      properties: {
        ...mockStakingTx.properties,
        mode: "claimRewards",
      },
    } as Transaction;

    const result = await prepareTransaction(mockAccount, mockTx);
    expect(result.recipient).toBe("0.0.reward");
    expect(result.amount.isEqualTo(new BigNumber(1))).toBe(true);
  });

  test("should set memo for staking transaction", async () => {
    const mockTx = { ...mockStakingTx };
    const result = await prepareTransaction(mockAccount, mockTx);
    expect(result.memo).toBe("Stake");
  });
});
