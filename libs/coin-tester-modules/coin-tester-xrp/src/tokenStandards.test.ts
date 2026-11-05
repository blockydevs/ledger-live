import type { Account, AccountBridge } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import { forbidRemoteRequests } from "@ledgerhq/coin-tester/localOnly";
import { makeXrpAccount } from "./fixtures";
import { getBridges, setLocalXrpConfig, syncAccount, type XrpTokenStandard } from "./helpers";
import {
  authorizeMpt,
  createMptIssuance,
  issue,
  openTrustLine,
  TF_MPT_CAN_TRANSFER,
} from "./local-tx";
import { fundAccount, newWallet, type XrplWallet } from "./rippled";
import { buildXrpSigner } from "./signer";
import { installTokenStore, iouAmount, makeIouToken, makeMptToken } from "./tokens";

global.console = require("console");
jest.setTimeout(600_000);

const MPT_ASSET_SCALE = 2;
const HELD_IOU_UPPER = "10";
const HELD_IOU_LOWER = "20";
const HELD_MPT = "500";

type ListedTokens = { usdUpper: TokenCurrency; mpt: TokenCurrency };

function balancesByTokenId(account: Account): Record<string, string> {
  return Object.fromEntries(
    (account.subAccounts ?? []).map(sub => [sub.token.id, sub.balance.toFixed()]),
  );
}

describe("XRP token standards", () => {
  let accountBridge: AccountBridge<GenericTransaction>;
  let stopRemoteGuard: () => void;
  let holder: XrplWallet;
  let iouIssuer: XrplWallet;
  let tokens: ListedTokens;

  beforeAll(async () => {
    stopRemoteGuard = forbidRemoteRequests();
    setLocalXrpConfig();
    ({ accountBridge } = await getBridges(buildXrpSigner()));

    holder = newWallet();
    iouIssuer = newWallet();
    const mptIssuer = newWallet();
    for (const wallet of [holder, iouIssuer, mptIssuer]) {
      await fundAccount(wallet.address, 100);
    }

    for (const [currency, value] of [
      ["USD", HELD_IOU_UPPER],
      ["usd", HELD_IOU_LOWER],
    ]) {
      await openTrustLine(holder, { currency, issuer: iouIssuer.address, limit: "1000" });
      await issue(iouIssuer, holder.address, { currency, issuer: iouIssuer.address, value });
    }

    const issuanceId = await createMptIssuance(mptIssuer, {
      assetScale: MPT_ASSET_SCALE,
      flags: TF_MPT_CAN_TRANSFER,
    });
    await authorizeMpt(holder, issuanceId);
    await issue(mptIssuer, holder.address, { mpt_issuance_id: issuanceId, value: HELD_MPT });

    tokens = {
      usdUpper: makeIouToken("USD", iouIssuer.address),
      mpt: makeMptToken(issuanceId, mptIssuer.address, "MPT", MPT_ASSET_SCALE),
    };
    installTokenStore(Object.values(tokens));
  });

  afterAll(() => {
    stopRemoteGuard?.();
  });

  async function syncHolder(enabledTokenStandards?: XrpTokenStandard[]): Promise<Account> {
    setLocalXrpConfig(enabledTokenStandards);
    return syncAccount(accountBridge, makeXrpAccount(holder.address));
  }

  it("the CAL stub matches network, issuer and reference exactly", async () => {
    const store = getCryptoAssetsStore();
    const lookup = (issuer: string, network: string, reference: string) =>
      store.findTokenByAddressInCurrency(issuer, network, reference);

    expect(await lookup(iouIssuer.address, "ripple", "USD")).toBe(tokens.usdUpper);
    expect(await lookup(iouIssuer.address, "ripple", "usd")).toBeUndefined();
    expect(await lookup(iouIssuer.address, "ripple", "Usd")).toBeUndefined();
    expect(await lookup(iouIssuer.address, "ripple_testnet", "USD")).toBeUndefined();
    expect(await lookup(holder.address, "ripple", "USD")).toBeUndefined();
    expect(
      await lookup(tokens.mpt.contractAddress, "ripple", tokens.mpt.tokenIdentifier!.toLowerCase()),
    ).toBeUndefined();

    expect(await store.findTokenById(tokens.usdUpper.id)).toBe(tokens.usdUpper);
    expect(tokens.usdUpper.id).toBe(
      `ripple/iou/0000000000000000000000005553440000000000:${iouIssuer.address.toLowerCase()}`,
    );
  });

  it("with enabledTokenStandards unset, no token sub-account exists", async () => {
    const account = await syncHolder();

    expect(account.balance.gt(0)).toBe(true);
    expect(account.subAccounts).toEqual([]);
  });

  it('with ["iou"], only the listed IOU sub-account exists', async () => {
    const account = await syncHolder(["iou"]);

    expect(balancesByTokenId(account)).toEqual({
      [tokens.usdUpper.id]: iouAmount(HELD_IOU_UPPER).toFixed(),
    });
  });

  it('with ["iou","mpt"], the IOU and MPT sub-accounts exist', async () => {
    const account = await syncHolder(["iou", "mpt"]);

    expect(balancesByTokenId(account)).toEqual({
      [tokens.usdUpper.id]: iouAmount(HELD_IOU_UPPER).toFixed(),
      [tokens.mpt.id]: HELD_MPT,
    });
  });
});
