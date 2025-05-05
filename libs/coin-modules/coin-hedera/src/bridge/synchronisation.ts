import { BigNumber } from "bignumber.js";
import invariant from "invariant";
import {
  getDerivationScheme,
  Result,
  runDerivationScheme,
} from "@ledgerhq/coin-framework/derivation";
import type { Account } from "@ledgerhq/types-live";
import {
  GetAccountShape,
  IterateResultBuilder,
  mergeOps,
} from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { encodeAccountId } from "@ledgerhq/coin-framework/account";
import { getAccountsForPublicKey, getOperationsForAccount } from "../api/mirror";
import { getAccountBalance } from "../api/network";
import { getSubAccounts, linkSubOperationsToCoinOperations, mergeSubAccounts } from "./utils";

export const getAccountShape: GetAccountShape<Account> = async (
  info,
): Promise<Partial<Account>> => {
  const { currency, derivationMode, address, initialAccount } = info;

  invariant(address, "an hedera address is expected");

  const liveAccountId = encodeAccountId({
    type: "js",
    version: "2",
    currencyId: currency.id,
    xpubOrAddress: address,
    derivationMode,
  });

  // get current account balance
  const accountBalance = await getAccountBalance(address);

  // grab latest operation's consensus timestamp for incremental sync
  const oldOperations = initialAccount?.operations ?? [];
  const latestOperationTimestamp = oldOperations[0]
    ? Math.floor(oldOperations[0].date.getTime() / 1000)
    : 0;
  const latestAccountOperations = await getOperationsForAccount(
    liveAccountId,
    address,
    new BigNumber(latestOperationTimestamp).toString(),
  );

  const newSubAccounts = await getSubAccounts(
    liveAccountId,
    latestAccountOperations.tokenOperations,
    accountBalance,
  );

  const subAccounts = mergeSubAccounts(initialAccount, newSubAccounts);

  const newOperations = linkSubOperationsToCoinOperations(
    latestAccountOperations.coinOperations,
    latestAccountOperations.tokenOperations,
  );

  const operations = mergeOps(oldOperations, newOperations);

  console.log("[DEBUG] coin-hedera bridge getAccountShape", {
    info,
    accountBalance,
    latestAccountOperations,
    oldOperations,
    newOperations,
    operations,
    latestOperationTimestamp,
    newSubAccounts,
    subAccounts,
    output: {
      id: liveAccountId,
      freshAddress: address,
      balance: accountBalance.balance,
      spendableBalance: accountBalance.balance,
      operations,
      // NOTE: there are no "blocks" in hedera
      // Set a value just so that operations are considered confirmed according to isConfirmedOperation
      blockHeight: 10,
    },
  });

  return {
    id: liveAccountId,
    freshAddress: address,
    balance: accountBalance.balance,
    spendableBalance: accountBalance.balance,
    operations,
    // NOTE: there are no "blocks" in hedera
    // Set a value just so that operations are considered confirmed according to isConfirmedOperation
    blockHeight: 10,
    subAccounts,
  };
};

export const buildIterateResult: IterateResultBuilder = async ({ result: rootResult }) => {
  const accounts = await getAccountsForPublicKey(rootResult.publicKey);
  const addresses = accounts.map(a => a.accountId.toString());

  console.log("[DEBUG] coin-hedera bridge buildIterateResult - prep", { accounts, addresses });

  return async ({ currency, derivationMode, index }) => {
    const derivationScheme = getDerivationScheme({
      derivationMode,
      currency,
    });
    const freshAddressPath = runDerivationScheme(derivationScheme, currency, {
      account: index,
    });

    console.log("[DEBUG] coin-hedera bridge buildIterateResult - return", {
      derivationScheme,
      derivationMode,
      currency,
      freshAddressPath,
      output: addresses[index]
        ? ({
            address: addresses[index],
            publicKey: addresses[index],
            path: freshAddressPath,
          } as Result)
        : null,
    });

    return addresses[index]
      ? ({
          address: addresses[index],
          publicKey: addresses[index],
          path: freshAddressPath,
        } as Result)
      : null;
  };
};
