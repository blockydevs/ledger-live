import { BigNumber } from "bignumber.js";
import { getFees, getStepPrice } from "../../api/node";
import { buildTransaction } from "../../buildTransaction";
import { DEFAULT_STEP_LIMIT } from "../../constants";
import getEstimatedFees from "../../getFeesForTransaction";
import * as logic from "../../logic";
import { IconAccount } from "../../types";

jest.mock("../../buildTransaction");
jest.mock("../../api/node");
jest.mock("../../logic");

const mockedLogic = jest.mocked(logic);

describe("getEstimatedFees", () => {
  beforeAll(() => {
    (global as any).FEES_SAFETY_BUFFER = new BigNumber(100);
  });
  it("should fetch the estimated fees correctly", async () => {
    const account: IconAccount = {
      currency: { id: "icon" },
      spendableBalance: new BigNumber(1000),
      pendingOperations: [],
      iconResources: { nonce: 1 },
    } as any;

    const transaction = {
      amount: new BigNumber(100),
      recipient: "recipient-address",
      fees: new BigNumber(10),
    } as any;

    const unsignedTx = {
      /* mock unsigned transaction */
    };
    const stepLimit = new BigNumber(100000);
    const stepPrice = new BigNumber(10);

    mockedLogic.calculateAmount.mockReturnValue(new BigNumber(100));
    (buildTransaction as jest.Mock).mockResolvedValue({ unsigned: unsignedTx });
    (getFees as jest.Mock).mockResolvedValue(stepLimit);
    (getStepPrice as jest.Mock).mockResolvedValue(stepPrice);

    const estimatedFees = await getEstimatedFees({ account, transaction });
    expect(estimatedFees.isEqualTo(stepLimit.multipliedBy(stepPrice))).toBe(true);
    expect(transaction.stepLimit).toEqual(stepLimit);
  });

  it("should return FEES_SAFETY_BUFFER if getStepPrice rejects", async () => {
    const account = {
      currency: { id: "icon" },
      spendableBalance: new BigNumber(1000),
      pendingOperations: [],
      iconResources: { nonce: 1 },
    } as any;

    const transaction = {
      amount: new BigNumber(100),
      recipient: "recipient-address",
      fees: new BigNumber(10),
    } as any;

    mockedLogic.calculateAmount.mockReturnValue(new BigNumber(100));
    // @ts-expect-error type
    mockedLogic.FEES_SAFETY_BUFFER = new BigNumber(100);
    (getStepPrice as jest.Mock).mockRejectedValue(new Error("Error"));
    (buildTransaction as jest.Mock).mockResolvedValue({ unsigned: {} });

    const estimatedFees = await getEstimatedFees({ account, transaction });
    expect(estimatedFees.isEqualTo(new BigNumber(100))).toBe(true);
  });

  it("should fall back to DEFAULT_STEP_LIMIT if the estimated step limit is zero", async () => {
    const account: IconAccount = {
      currency: { id: "icon" },
      spendableBalance: new BigNumber(1000),
      pendingOperations: [],
      iconResources: { nonce: 1 },
    } as any;

    const transaction = {
      amount: new BigNumber(100),
      recipient: "recipient-address",
      fees: new BigNumber(10),
    } as any;

    const stepPrice = new BigNumber(10);

    mockedLogic.calculateAmount.mockReturnValue(new BigNumber(100));
    (buildTransaction as jest.Mock).mockResolvedValue({ unsigned: {} });
    (getFees as jest.Mock).mockResolvedValue(new BigNumber(0));
    (getStepPrice as jest.Mock).mockResolvedValue(stepPrice);

    const estimatedFees = await getEstimatedFees({ account, transaction });
    expect(estimatedFees.isEqualTo(new BigNumber(DEFAULT_STEP_LIMIT).multipliedBy(stepPrice))).toBe(
      true,
    );
    expect(transaction.stepLimit).toEqual(new BigNumber(DEFAULT_STEP_LIMIT));
  });

  it("should estimate against a nominal amount when useAllAmount is set", async () => {
    const account: IconAccount = {
      currency: { id: "icon" },
      spendableBalance: new BigNumber(1000),
      pendingOperations: [],
      iconResources: { nonce: 1 },
    } as any;

    const transaction = {
      amount: new BigNumber(1000),
      recipient: "recipient-address",
      fees: new BigNumber(10),
      useAllAmount: true,
    } as any;

    const stepLimit = new BigNumber(100000);
    const stepPrice = new BigNumber(10);

    (buildTransaction as jest.Mock).mockResolvedValue({ unsigned: {} });
    (getFees as jest.Mock).mockResolvedValue(stepLimit);
    (getStepPrice as jest.Mock).mockResolvedValue(stepPrice);

    const calledAmountsBefore = mockedLogic.calculateAmount.mock.calls.length;

    await getEstimatedFees({ account, transaction });

    expect(mockedLogic.calculateAmount.mock.calls.length).toBe(calledAmountsBefore);
    const buildTransactionCalls = (buildTransaction as jest.Mock).mock.calls;
    const [, calledTransaction] = buildTransactionCalls[buildTransactionCalls.length - 1];
    expect(calledTransaction.amount.isEqualTo(new BigNumber(1))).toBe(true);
  });
});
