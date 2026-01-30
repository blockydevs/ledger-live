import BigNumber from "bignumber.js";
import invariant from "invariant";
import {
  type GetAccountShape,
  makeSync,
  mergeOps,
} from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { decodeAccountId, encodeAccountId } from "@ledgerhq/coin-framework/account/accountId";
import { getBalance, lastBlock, listOperations } from "../logic";
import { accessProvableApi } from "../logic/accessProvableApi";
import type { AleoAccount, AleoResources, ProvableApi } from "../types";
import { getPrivateBalance } from "../logic/getPrivateBalance";

export const getAccountShape: GetAccountShape<AleoAccount> = async infos => {
  const { initialAccount, address, derivationMode, currency } = infos;

  let viewKey: string | undefined;
  let provableApi: ProvableApi | null = null;

  if (initialAccount) {
    viewKey = decodeAccountId(initialAccount.id).customData;
    invariant(viewKey, `aleo: viewKey is missing in initialAccount ${initialAccount.id}`);

    if (viewKey) {
      provableApi = await accessProvableApi(
        currency,
        viewKey,
        address,
        initialAccount.aleoResources.provableApi,
      );
    }
  }

  const [latestBlock, balances] = await Promise.all([
    lastBlock(currency),
    getBalance(currency, address),
  ]);

  const ledgerAccountId = encodeAccountId({
    type: "js",
    version: "2",
    currencyId: currency.id,
    xpubOrAddress: address,
    derivationMode,
    ...(viewKey && {
      customData: viewKey,
    }),
  });

  const nativeBalance = balances.find(b => b.asset.type === "native")?.value ?? BigInt(0);
  const transparentBalance = new BigNumber(nativeBalance.toString());
  const spendableBalance = transparentBalance;
  const { jwt, uuid, apiKey } = provableApi ?? {};
  let privateBalance: AleoResources["privateBalance"] = null;
  let privateBalanceRecords: AleoResources["privateBalanceRecords"] = null;

  if (provableApi !== null && jwt && uuid && apiKey && viewKey) {
    const { records, balance } = await getPrivateBalance({
      jwtToken: jwt.token,
      uuid,
      apiKey,
      viewKey,
    });

    privateBalance = balance;
    privateBalanceRecords = records;
  }

  const shouldSyncFromScratch = !initialAccount;
  const oldOperations = shouldSyncFromScratch ? [] : initialAccount?.operations ?? [];
  const latestOperation = oldOperations[0];
  const lastBlockHeight = shouldSyncFromScratch ? 0 : latestOperation?.blockHeight ?? 0;
  const latestAccountOperations = await listOperations({
    currency,
    address,
    ledgerAccountId,
    fetchAllPages: true,
    pagination: {
      minHeight: 0,
      order: "asc",
      ...(lastBlockHeight > 0 && { lastPagingToken: lastBlockHeight.toString() }),
    },
  });

  // sort by date desc
  latestAccountOperations.operations.sort((a, b) => b.date.getTime() - a.date.getTime());

  // merge old and new operations
  const operations = shouldSyncFromScratch
    ? latestAccountOperations.operations
    : mergeOps(oldOperations, latestAccountOperations.operations);

  return {
    type: "Account",
    id: ledgerAccountId,
    balance: spendableBalance,
    spendableBalance: spendableBalance,
    blockHeight: latestBlock.height,
    operations,
    operationsCount: operations.length,
    lastSyncDate: new Date(),
    aleoResources: {
      transparentBalance,
      privateBalanceRecords,
      privateBalance,
      provableApi,
      lastPrivateSyncDate: provableApi?.scannerStatus?.synced
        ? new Date()
        : initialAccount?.aleoResources.lastPrivateSyncDate || null,
    },
  };
};

export const sync = makeSync({
  getAccountShape,
});
