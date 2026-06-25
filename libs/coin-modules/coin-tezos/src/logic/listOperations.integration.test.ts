/**
 * Integration test that calls the real TzKT API to verify listOperations
 * produces ops whose balance adds up to the on-chain balance.
 *
 * Uses tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb — an account with originations
 * and internal contract sub-transactions whose storage fees are charged to
 * the initiator.
 */
import coinConfig from "../config";
import { listOperations } from "./listOperations";

// Point at public TzKT
beforeAll(() => {
  coinConfig.setCoinConfig(() => ({
    explorer: {
      url: "https://api.tzkt.io",
      maxTxQuery: 100,
    },
    baker: { url: "" },
  }));
});

describe("listOperations balance consistency", () => {
  const address = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

  it("native ops sum to the on-chain balance", async () => {
    // Fetch all operations (paginate until exhausted)
    let allOps: Awaited<ReturnType<typeof listOperations>>[0] = [];
    let token: string | undefined;
    do {
      const [ops, next] = await listOperations(address, {
        sort: "Ascending",
        minHeight: 0,
        limit: 200,
        token,
      });
      allOps = allOps.concat(ops);
      token = next || undefined;
    } while (token);

    // Filter native ops only
    const nativeOps = allOps.filter(op => op.asset.type === "native");

    // Sum IN/OUT values
    let balance = 0n;
    for (const op of nativeOps) {
      if (op.type === "IN") {
        balance += op.value;
      } else if (op.type === "OUT") {
        balance -= op.value;
      }
      // FEES/DELEGATE/UNDELEGATE/REVEAL/ORIGINATION have value=0 for native
    }

    // Subtract fees only when this account is the fee payer (matching A4 logic
    // in CoinServiceAdapters which checks isRelevantAddress(payer)).
    let totalFees = 0n;
    for (const op of nativeOps) {
      if (op.tx.feesPayer === address && op.tx.fees > 0n) {
        totalFees += op.tx.fees;
      }
    }
    balance -= totalFees;

    // Fetch actual balance from TzKT
    const resp = await fetch(`https://api.tzkt.io/v1/accounts/${address}`);
    const account = await resp.json();
    const onChainBalance = BigInt(account.balance);

    expect(balance).toEqual(onChainBalance);
  }, 60_000);
});
