// import type { Operation, Pagination } from "@ledgerhq/coin-framework/api/types";
// import {
//   encodeAccountId,
//   encodeTokenAccountId,
// } from "@ledgerhq/coin-framework/lib/account/accountId";
// import { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
// import { apiClient } from "../network/api";
// import { encodeOperationId } from "@ledgerhq/coin-framework/lib/operation";
// import { AleoOperation, AleoOperationExtra } from "../types";
// import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets/tokens";
// import { AleoMirrorTransaction } from "../types/mirror";
// import { parseTransfer } from "../network/utils";
// import BigNumber from "bignumber.js";
// // import network from "@ledgerhq/live-network";

import type { Operation } from "@ledgerhq/coin-framework/api/types";
export const MOCKED_WALLET_ADDRESS =
  "aleo1zcwqycj02lccfuu57dzjhva7w5dpzc7pngl0sxjhp58t6vlnnqxs6lnp6f";

// // const fetch = <Result>(path: string) => {
// //   return network<Result>({
// //     method: "GET",
// //     url: `https://api.explorer.provable.com/v2/mainnet/${path}`,
// //   });
// // };

export async function listOperations(
  _address: string,
  _pagination: unknown,
): Promise<[Operation[], string]> {
  // eslint-disable-next-line no-console
  console.log("LIST OPERATIONS FIRED", MOCKED_WALLET_ADDRESS);
  return [[], ""];
  // throw new Error("TODO: not implemented");
}

// function processTokenTransfer({
//   rawTx,
//   address,
//   currency,
//   ledgerAccountId,
//   // commonData,
//   skipFeesForTokenOperations,
// }: {
//   rawTx: AleoMirrorTransaction;
//   address: string;
//   currency: CryptoCurrency;
//   ledgerAccountId: string;
//   // commonData: ReturnType<typeof getCommonOperationData>;
//   skipFeesForTokenOperations: boolean;
// }): {
//   coinOperation: Operation<AleoOperationExtra> | undefined;
//   tokenOperation: Operation<AleoOperationExtra>;
// } | null {
//   if (rawTx.program_id !== "credits.aleo") return null;

//   const token = findTokenByAddressInCurrency("aleo", currency.id);
//   console.log(token);

//   if (!token) return null;

//   const encodedTokenId = encodeTokenAccountId(ledgerAccountId, token);
//   const { type, value, senders, recipients } = parseTransfer(rawTx, address);
//   // const { hash, fee, timestamp, blockHeight, blockHash, hasFailed } = commonData;
//   // const extra = { ...commonData.extra };

//   console.log(value);

//   let coinOperation: Operation<AleoOperationExtra> | undefined;

//   // Add main FEES coin operation for send token transfer
//   if (type === "OUT" && !skipFeesForTokenOperations) {
//     coinOperation = {
//       id: encodeOperationId(ledgerAccountId, rawTx.transaction_id, "FEES"),
//       accountId: ledgerAccountId,
//       type: "FEES",
//       value: BigInt(0),
//       recipients,
//       senders,
//       hash: rawTx.transition_id,
//       fee: BigNumber(0),
//       date: rawTx.block_timestamp,
//       blockHeight: rawTx.block_number,
//       blockHash: null,
//       hasFailed: false,
//       extra: {},
//     };
//   }

//   const tokenOperation = {
//     id: encodeOperationId(encodedTokenId, rawTx.transaction_id, type),
//     accountId: encodedTokenId,
//     contract: token.contractAddress,
//     standard: "hts",
//     type,
//     value: BigInt(0),
//     recipients,
//     senders,
//     hash: rawTx.transition_id,
//     fee: BigNumber(0),
//     date: rawTx.block_timestamp,
//     blockHeight: rawTx.block_number,
//     blockHash: null,
//     hasFailed: false,
//     extra: {},
//   } satisfies Operation<AleoOperationExtra>;

//   return {
//     coinOperation,
//     tokenOperation,
//   };
// }

// export async function listOperations({
//   currency,
//   address,
//   // mirrorTokens,
//   pagination,
//   fetchAllPages,
//   skipFeesForTokenOperations,
//   // useEncodedHash,
//   // useSyntheticBlocks,
// }: {
//   currency: CryptoCurrency;
//   address: string;
//   // mirrorTokens: AleoMirrorToken[];
//   pagination: Pagination;
//   // options for compatibility with old bridge
//   fetchAllPages: boolean;
//   skipFeesForTokenOperations: boolean;
//   useEncodedHash: boolean;
//   useSyntheticBlocks: boolean;
// }): Promise<{
//   coinOperations: Operation<AleoOperationExtra>[];
//   // tokenOperations: Operation<AleoOperationExtra>[];
//   // nextCursor: string | null;
// }> {
//   const coinOperations: Operation[] = [];
//   // const tokenOperations: Operation<HederaOperationExtra>[] = [];
//   const mirrorResult = await apiClient.getAccountTransactions({
//     address,
//     limit: pagination.limit,
//     offset: Number(pagination.pagingToken),
//     fetchAllPages,
//   });
//   const ledgerAccountId = encodeAccountId({
//     type: "js",
//     version: "2",
//     currencyId: currency.id,
//     xpubOrAddress: address,
//     derivationMode: "aleo",
//   });

//   for (const rawTx of mirrorResult.transactions) {
//     // const commonData = getCommonOperationData(rawTx, useEncodedHash, useSyntheticBlocks);

//     // process token transfers
//     const tokenResult = processTokenTransfer({
//       rawTx,
//       address,
//       currency,
//       ledgerAccountId,
//       // commonData,
//       skipFeesForTokenOperations,
//     });

//     if (tokenResult?.coinOperation) coinOperations.push(tokenResult.coinOperation);
//     // if (tokenResult?.tokenOperation) tokenOperations.push(tokenResult.tokenOperation);

//     // process regular transfers only if there were no token transfers
//     // if (!tokenResult) {
//     //   const coinOperation = processTransfer({
//     //     rawTx,
//     //     address,
//     //     ledgerAccountId,
//     //     // commonData,
//     //     // mirrorTokens,
//     //   });

//     //   if (coinOperation) coinOperations.push(coinOperation);
//     // }
//   }

//   return {
//     coinOperations: [],
//     // tokenOperations,
//     // nextCursor: mirrorResult.nextCursor,
//   };
// }
