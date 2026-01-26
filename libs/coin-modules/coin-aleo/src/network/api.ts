import network from "@ledgerhq/live-network";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";

import {
  AleoAccountJWTResponse,
  AleoJWT,
  AleoLatestBlockResponse,
  AleoPublicTransactionDetails,
  AleoPublicTransactions,
  AleoRecordScannerStatusResponse,
  AleoRegisterAccountResponse,
  AleoRegisterForRecordsResponse,
  DelegatedProvingResponse,
} from "../types/api";
import { PROGRAM_ID } from "../constants";
import { PrepareRequestBody } from "../types/sdk";
import { getNetworkConfig } from "../logic/utils";

async function getLatestBlock(currency: CryptoCurrency): Promise<AleoLatestBlockResponse> {
  const { nodeUrl } = getNetworkConfig(currency);

  const res = await network<AleoLatestBlockResponse>({
    method: "GET",
    url: `${nodeUrl}/blocks/latest`,
  });

  return res.data;
}

async function getAccountBalance(
  currency: CryptoCurrency,
  address: string,
): Promise<string | null> {
  const { nodeUrl } = getNetworkConfig(currency);

  const res = await network<string | null>({
    method: "GET",
    url: `${nodeUrl}/programs/program/${PROGRAM_ID.CREDITS}/mapping/account/${address}`,
  });

  return res.data;
}

async function getTransactionById(
  currency: CryptoCurrency,
  transactionId: string,
): Promise<AleoPublicTransactionDetails> {
  const { nodeUrl } = getNetworkConfig(currency);

  const res = await network<AleoPublicTransactionDetails>({
    method: "GET",
    url: `${nodeUrl}/transactions/${transactionId}`,
  });

  return res.data;
}

async function getAccountPublicTransactions({
  currency,
  address,
  cursor,
  limit = 50,
  order = "asc",
  direction = "next",
}: {
  currency: CryptoCurrency;
  address: string;
  cursor?: string;
  limit?: number;
  order?: "asc" | "desc";
  direction?: "prev" | "next";
}): Promise<AleoPublicTransactions> {
  const { nodeUrl } = getNetworkConfig(currency);
  const params = new URLSearchParams({
    limit: limit.toString(),
    sort: order,
    direction,
    ...(cursor && { cursor_block_number: cursor }),
  });

  const res = await network<AleoPublicTransactions>({
    method: "GET",
    url: `${nodeUrl}/transactions/address/${address}?${params.toString()}`,
  });

  return res.data;
}

// FIXME: url based on config
async function submitDelegatedProvingRequest({
  currency,
  authorization,
  feeAuthorization,
  broadcast,
  jwt,
}: {
  currency: CryptoCurrency;
  authorization: PrepareRequestBody;
  feeAuthorization: PrepareRequestBody;
  broadcast: boolean;
  jwt: string;
}): Promise<DelegatedProvingResponse> {
  const { networkType } = getNetworkConfig(currency);
  const res = await network<DelegatedProvingResponse>({
    method: "POST",
    url: `https://api.provable.com/prove/${networkType}/prove`,
    headers: {
      authorization: jwt,
    },
    data: {
      authorization,
      fee_authorization: feeAuthorization,
      broadcast,
    },
  });

  return res.data;
}

async function registerNewAccount(
  currency: CryptoCurrency,
  username: string,
): Promise<AleoRegisterAccountResponse> {
  const res = await network<AleoRegisterAccountResponse>({
    method: "POST",
    url: `https://api.provable.com/consumers`,
    data: { username },
  });

  return res.data;
}

async function getAccountJWT(
  currency: CryptoCurrency,
  apiKey: string,
  consumerId: string,
): Promise<AleoJWT> {
  const res = await network<AleoAccountJWTResponse>({
    method: "POST",
    url: `https://api.provable.com/jwts/${consumerId}`,
    headers: {
      "X-Provable-API-Key": apiKey,
    },
  });

  const data = {
    token: res.headers?.["authorization"] ?? "",
    exp: res.data.exp,
  };

  return data;
}

async function registerForScanningAccountRecords(
  currency: CryptoCurrency,
  jwt: string,
  viewKey: string,
  start: number = 0,
): Promise<AleoRegisterForRecordsResponse> {
  const res = await network<AleoRegisterForRecordsResponse>({
    method: "POST",
    url: `https://api.provable.com/scanner/mainnet/register`,
    headers: {
      Authorization: jwt,
    },
    data: { view_key: viewKey, start },
  });

  return res.data;
}

export const getRecordScannerStatus = async (
  currency: CryptoCurrency,
  accessToken: string,
  uuid: string,
): Promise<AleoRecordScannerStatusResponse> => {
  const res = await network<AleoRecordScannerStatusResponse>({
    method: "POST",
    url: "https://api.provable.com/scanner/mainnet/status",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json",
    },
    data: `"${uuid.toString()}"`,
  });

  return res.data;
};

export const apiClient = {
  getLatestBlock,
  getAccountBalance,
  getTransactionById,
  getAccountPublicTransactions,
  getAccountJWT,
  registerNewAccount,
  getRecordScannerStatus,
  registerForScanningAccountRecords,
  submitDelegatedProvingRequest,
};
