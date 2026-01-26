import network from "@ledgerhq/live-network";
import aleoConfig from "../config";
import { getMockedCurrency } from "../test/fixtures/currency.fixture";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import { sdkClient } from "./sdk";

jest.mock("@ledgerhq/live-network");
jest.mock("../config");

const mockNetwork = network as jest.MockedFunction<typeof network>;
const mockGetCoinConfig = aleoConfig.getCoinConfig as jest.MockedFunction<
  typeof aleoConfig.getCoinConfig
>;

describe("sdkClient", () => {
  const mockCurrency = getMockedCurrency();
  const mockConfig = getMockedConfig();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCoinConfig.mockReturnValue(mockConfig);
  });

  it("todo:", () => {});
});
