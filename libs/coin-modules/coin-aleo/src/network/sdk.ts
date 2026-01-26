import network from "@ledgerhq/live-network";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { getNetworkConfig } from "../logic/utils";
import type {
  AuthorizationResponse,
  DecryptResponse,
  DevKeysResponse,
  DevSignatureData,
  Intent,
  PreparedRequestResponse,
} from "../types/sdk";

async function createRequestFromIntent({
  currency,
  intent,
  viewKey,
}: {
  currency: CryptoCurrency;
  intent: Intent;
  viewKey: string;
}) {
  const { sdkUrl } = getNetworkConfig(currency);

  const res = await network<PreparedRequestResponse>({
    method: "POST",
    url: `${sdkUrl}/transactions/request`,
    data: {
      intent,
      view_key: viewKey,
    },
  });

  return res.data;
}

async function createAuthorization({
  currency,
  request,
  signatures,
  viewKey,
  computeKey,
}: {
  currency: CryptoCurrency;
  request: PreparedRequestResponse;
  signatures: DevSignatureData;
  viewKey: string;
  computeKey: string;
}) {
  const { sdkUrl } = getNetworkConfig(currency);

  const res = await network<AuthorizationResponse>({
    method: "POST",
    url: `${sdkUrl}/transactions/authorization`,
    data: {
      request,
      signatures,
      view_key: viewKey,
      compute_key: computeKey,
    },
  });

  return res.data;
}

async function decryptRecord({
  currency,
  ciphertext,
  viewKey,
}: {
  currency: CryptoCurrency;
  ciphertext: string;
  viewKey: string;
}) {
  const { sdkUrl } = getNetworkConfig(currency);

  const res = await network<DecryptResponse>({
    method: "POST",
    url: `${sdkUrl}/decrypt`,
    data: {
      ciphertext,
      view_key: viewKey,
    },
  });

  return res.data;
}

async function getDevKeys({ currency }: { currency: CryptoCurrency }) {
  const { networkType } = getNetworkConfig(currency);

  const res = await network<DevKeysResponse>({
    method: "GET",
    url: `http://10.3.19.130/network/${networkType}/dev/keys`,
  });

  return res.data;
}

async function devSign({
  currency,
  request,
}: {
  currency: CryptoCurrency;
  request: PreparedRequestResponse;
}) {
  const { networkType } = getNetworkConfig(currency);

  const res = await network<DevSignatureData>({
    method: "POST",
    url: `http://10.3.19.130/network/${networkType}/dev/sign`,
    data: request,
  });

  return res.data;
}

// TODO: better comment
// SDK is handled by our backend, because it wouldn't be compatible with React Native
export const sdkClient = {
  createAuthorization,
  createRequestFromIntent,
  decryptRecord,
  // TODO: remove dev logic
  devSign,
  getDevKeys,
};
