import console from "console";
import { getAccount, getCurrentBlockHeight, getOperations } from "@ledgerhq/coin-icon/api/index";
import { getDelegation } from "@ledgerhq/coin-icon/api/node";
import { setCoinConfig } from "@ledgerhq/coin-icon/config";
import { IISS_SCORE_ADDRESS } from "@ledgerhq/coin-icon/constants";
import { convertICXtoLoop, convertLoopToIcx } from "@ledgerhq/coin-icon/logic";
import BigNumber from "bignumber.js";
import {
  coinConfigFactory,
  DEV_ADDRESS,
  GENESIS_BALANCE_ICX,
  GENESIS_BALANCE_LOOP,
  GOD_ADDRESS,
  GOD_PRIVATE_KEY,
  icon,
  localConfig,
} from "./fixtures";
import { killGoloop, spawnGoloop } from "./goloop";
import { rpc, sendIcx, waitForTransaction } from "./helpers";
import { initIndexer, registerTransaction } from "./indexer";

global.console = console;
jest.setTimeout(600_000);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The describe blocks below depend on running in declaration order:
// the "node" block's genesis-balance assertion runs before "raw transfer" spends fees,
// and the "indexer" block reads the hash that "raw transfer" records.

let closeIndexer: () => void;
let transferHash: string;
let transferValueLoop: BigNumber;

beforeAll(async () => {
  await spawnGoloop();
  setCoinConfig(coinConfigFactory);
  closeIndexer = initIndexer();
});

afterAll(async () => {
  closeIndexer?.();
  await killGoloop();
});

describe("fixtures", () => {
  it("derives distinct ICON addresses from the devnet keys", () => {
    expect(GOD_ADDRESS).toMatch(/^hx[0-9a-f]{40}$/);
    expect(DEV_ADDRESS).toMatch(/^hx[0-9a-f]{40}$/);
    expect(GOD_ADDRESS).not.toEqual(DEV_ADDRESS);
  });

  it("states the genesis balance in loop", () => {
    expect(GENESIS_BALANCE_LOOP).toEqual(convertICXtoLoop(GENESIS_BALANCE_ICX));
    expect(convertLoopToIcx(GENESIS_BALANCE_LOOP).toString()).toEqual(
      GENESIS_BALANCE_ICX.toString(),
    );
  });

  it("points the coin config at the devnet and at the indexer double", () => {
    expect(localConfig.infra.node_endpoint).toEqual("http://127.0.0.1:9080/api/v3");
    expect(localConfig.infra.indexer).toEqual("http://indexer.sodax.local/api/v1");
    expect(icon.id).toEqual("icon");
  });
});

describe("node", () => {
  it("advances the block height", async () => {
    const first = (await rpc.getLastBlock().execute()).height;
    // The single validator produces a block every 1000 ms.
    await sleep(3000);
    const second = (await rpc.getLastBlock().execute()).height;
    expect(second).toBeGreaterThan(first);
  });

  it("runs with network id 0x1", async () => {
    const info = await rpc.getNetworkInfo().execute();
    expect(info.nid.toNumber()).toEqual(1);
    expect(info.platform).toEqual("icon");
  });

  it("holds the genesis balance on the god and dev wallets", async () => {
    // This runs before any test spends fees from the god wallet.
    const godBalance = await rpc.getBalance(GOD_ADDRESS).execute();
    const devBalance = await rpc.getBalance(DEV_ADDRESS).execute();
    expect(godBalance.toFixed()).toEqual(GENESIS_BALANCE_LOOP.toFixed());
    expect(devBalance.toFixed()).toEqual(GENESIS_BALANCE_LOOP.toFixed());
  });

  it("answers getDelegation on the chain SCORE", async () => {
    // A silent cx…00 sends every future sync into the catch that returns a
    // zero account, so a green sync would prove nothing.
    expect(IISS_SCORE_ADDRESS).toEqual("cx0000000000000000000000000000000000000000");
    const delegation = await getDelegation(GOD_ADDRESS, icon);
    expect(delegation.totalDelegated.isZero()).toBe(true);
    expect(delegation.votingPower.isZero()).toBe(true);
  });
});

describe("raw transfer", () => {
  it("moves ICX from the god wallet to the dev wallet", async () => {
    const valueLoop = convertICXtoLoop(1);
    const before = await rpc.getBalance(DEV_ADDRESS).execute();

    const hash = await sendIcx({
      privateKey: GOD_PRIVATE_KEY,
      to: DEV_ADDRESS,
      valueLoop,
    });
    const receipt = await waitForTransaction(hash);

    expect(new BigNumber(receipt.status).toNumber()).toEqual(1);
    expect(receipt.stepUsed.isGreaterThan(0)).toBe(true);
    expect(receipt.blockHeight).toBeGreaterThan(0);

    const after = await rpc.getBalance(DEV_ADDRESS).execute();
    expect(after.minus(before).toFixed()).toEqual(valueLoop.toFixed());

    transferHash = hash;
    transferValueLoop = valueLoop;
    registerTransaction(hash);
  });
});

describe("indexer", () => {
  it("reports the same block height as RPC", async () => {
    const before = (await rpc.getLastBlock().execute()).height;
    const height = await getCurrentBlockHeight(icon);
    const after = (await rpc.getLastBlock().execute()).height;
    expect(height).toBeGreaterThanOrEqual(before);
    expect(height as number).toBeLessThanOrEqual(after);
  });

  it("reports the same balance as RPC, in ICX", async () => {
    const account = await getAccount(DEV_ADDRESS, icon);
    const balanceLoop = await rpc.getBalance(DEV_ADDRESS).execute();
    expect(convertICXtoLoop(account.balance).toFixed()).toEqual(balanceLoop.toFixed());
  });

  it("returns one operation for the submitted transfer", async () => {
    const accountId = `js:2:icon:${GOD_ADDRESS}:`;
    const operations = await getOperations(accountId, GOD_ADDRESS, 0, icon, 100);

    expect(operations).toHaveLength(1);
    const [operation] = operations;
    expect(operation.hash).toEqual(transferHash);
    expect(operation.type).toEqual("OUT");
    expect(operation.senders).toEqual([GOD_ADDRESS]);
    expect(operation.recipients).toEqual([DEV_ADDRESS]);
    expect(operation.hasFailed).toBe(false);
    expect(operation.fee.isGreaterThan(0)).toBe(true);
    // getOperationValue adds the fee for the sender.
    expect(operation.value.toFixed()).toEqual(transferValueLoop.plus(operation.fee).toFixed());
  });

  it("throws on an unmocked external URL", async () => {
    await expect(fetch("https://tracker.example.com/api/v1/blocks")).rejects.toThrow();
  });
});

// `exit` and some signal paths do not await pending promises, so the handler
// triggers teardown synchronously. killGoloop guards itself against a second
// call, so the double registration with goloop.ts's own handlers runs the
// compose down once.
["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(
  event => {
    process.on(event, () => {
      void killGoloop().catch(() => {});
    });
  },
);
