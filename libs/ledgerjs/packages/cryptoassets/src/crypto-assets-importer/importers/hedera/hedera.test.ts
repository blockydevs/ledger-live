import axios from "axios";
import { importHederaTokens } from ".";
import fs from "fs";

// FIXME: adjust to CAL shape
const hederaTokens = [
  {
    id: "hedera/hts/hbark:0.0.5022567",
    blockchain_name: "hedera",
    contract_address: "0.0.5022567",
    decimals: 0,
    delisted: false,
    name: "hBARK",
    ticker: "HBARK",
  },
];

const mockedAxios = jest.spyOn(axios, "get");

describe("import Hedera tokens", () => {
  beforeEach(() => {
    mockedAxios.mockImplementation(() =>
      Promise.resolve({
        data: hederaTokens,
        headers: { ["etag"]: "commitHash" },
      }),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should output the file in the correct format", async () => {
    const expectedFile = `export type HederaToken = [
  string, // tokenId
  string, // name
  string, // ticker
  number, // decimals
];

import tokens from "./hedera.json";

export { default as hash } from "./hedera-hash.json";

export default tokens as HederaToken[];
`;

    const mockedFs = (fs.writeFileSync = jest.fn());

    await importHederaTokens(".");

    expect(mockedAxios).toHaveBeenCalledWith(
      "https://crypto-assets-service.api.ledger.com/v1/tokens",
      { params: { blockchain_name: "hedera", output: "contract_address,name,ticker,decimals" } },
    );
    expect(mockedFs).toHaveBeenNthCalledWith(
      1,
      "hedera.json",
      JSON.stringify([["0.0.5022567", "hBARK", "HBARK", 0]]),
    );
    expect(mockedFs).toHaveBeenNthCalledWith(2, "hedera-hash.json", JSON.stringify("commitHash"));
    expect(mockedFs).toHaveBeenNthCalledWith(3, "hedera.ts", expectedFile);
  });
});
