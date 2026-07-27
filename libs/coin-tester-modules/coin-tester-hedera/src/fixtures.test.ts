import { makeLocalErc20Token } from "./fixtures";

describe("makeLocalErc20Token", () => {
  it("lowercases the contract address", () => {
    const token = makeLocalErc20Token("0xABCDEF0123456789abcdef0123456789ABCDEF01");

    expect(token.contractAddress).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
  });

  it("sets tokenType to erc20", () => {
    const token = makeLocalErc20Token("0xabcdef0123456789abcdef0123456789abcdef01");

    expect(token.tokenType).toBe("erc20");
  });
});
