import BigNumber from "bignumber.js";
import { createBridges } from ".";
import { getEstimatedFees } from "./utils";
import { getMockedAccount } from "../test/fixtures/account";

const mockedAccount = getMockedAccount();

describe("js-estimateMaxSpendable", () => {
  let bridge: ReturnType<typeof createBridges>;
  let estimatedFees = new BigNumber("150200").multipliedBy(2); // 0.001502 ℏ (as of 2023-03-14)

  beforeAll(async () => {
    const signer = jest.fn();
    bridge = createBridges(signer);
    estimatedFees = await getEstimatedFees(mockedAccount, "CryptoTransfer");
  });

  test("estimateMaxSpendable", async () => {
    const result = await bridge.accountBridge.estimateMaxSpendable({
      account: mockedAccount,
    });
    const data = mockedAccount.balance.minus(estimatedFees);

    expect(result).toEqual(data);
  });
});
