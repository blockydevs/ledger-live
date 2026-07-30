import BigNumber from "bignumber.js";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { setCoinConfig } from "@ledgerhq/coin-casper/config";
import { fetchAccountStateInfo, fetchBalance, fetchBlockHeight } from "@ledgerhq/coin-casper/api";
import { DEVNET_SANITY_USER_INDEX, GENESIS_USER_BALANCE_MOTES, localCoinConfig } from "./fixtures";
import { deriveUser, rawAccountInfo } from "./casperDevnet";

global.console = require("console");
jest.setTimeout(600_000);

describe("Casper devnet infrastructure", () => {
  let userPublicKey: string;
  let userAccountHash: string;

  beforeAll(async () => {
    setCoinConfig(() => localCoinConfig);
    LiveConfig.setConfig({
      config_currency_casper: {
        type: "object",
        default: localCoinConfig,
      },
    });
    const user = await deriveUser(DEVNET_SANITY_USER_INDEX);
    userPublicKey = user.publicKey;
    userAccountHash = user.accountHash;
  });

  it("serves JSON-RPC to the module's own client", async () => {
    const height = await fetchBlockHeight();
    expect(height).toBeGreaterThan(0);
  });

  it("derives a user key in the format PublicKey.fromHex accepts", () => {
    expect(userPublicKey).toMatch(/^02[0-9a-f]{66}$/);
  });

  it("resolves the genesis user account", async () => {
    const { accountHash, purseUref } = await fetchAccountStateInfo(userPublicKey);

    // fetchAccountStateInfo swallows RPC codes -32009 and -32003 into
    // { undefined, undefined }, so a bare toBeDefined() would fail with
    // nothing to act on. Surface the raw response instead.
    if (!purseUref || !accountHash) {
      const raw = await rawAccountInfo(userPublicKey);
      throw new Error(
        `fetchAccountStateInfo returned accountHash=${accountHash} purseUref=${purseUref}\n` +
          `raw state_get_account_info response: ${raw}`,
      );
    }

    expect(purseUref).toMatch(/^uref-/);
    console.log(`module accountHash=${accountHash} cli accountHash=${userAccountHash}`);
    expect(accountHash).toBe(userAccountHash);
  });

  it("reads the genesis prefunding through fetchBalance", async () => {
    const { purseUref } = await fetchAccountStateInfo(userPublicKey);
    if (!purseUref) {
      throw new Error("purseUref is undefined — see the account resolution failure above");
    }

    const balance = await fetchBalance(purseUref);

    expect(balance).toBeInstanceOf(BigNumber);
    expect(balance.toFixed()).toBe(GENESIS_USER_BALANCE_MOTES.toFixed());
  });
});
