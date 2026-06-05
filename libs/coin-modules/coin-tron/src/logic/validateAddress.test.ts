import { validateAddress } from "./validateAddress";

describe("validateAddress", () => {
  it("returns true for a valid mainnet address (incident address)", async () => {
    expect(await validateAddress("TNYJQhvXQAfeFFXH5G6cV5uXrx168fnFGE", {})).toBe(true);
  });

  it("returns true for another valid mainnet address", async () => {
    expect(await validateAddress("TGj1Ej1qRzL9feLTLhjwgxXF4Ct6GTWg2U", {})).toBe(true);
  });

  it("returns false for an empty string", async () => {
    expect(await validateAddress("", {})).toBe(false);
  });

  it("returns false for a clearly invalid string", async () => {
    expect(await validateAddress("notanaddress", {})).toBe(false);
  });

  it("returns false for a Bitcoin address (wrong version byte)", async () => {
    expect(await validateAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfna", {})).toBe(false);
  });
});
