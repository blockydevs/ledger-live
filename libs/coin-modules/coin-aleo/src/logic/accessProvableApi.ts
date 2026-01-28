import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import type { AleoAccount, ProvableApi } from "../types";
import { apiClient } from "../network/api";
import { getAccountJWT } from "./getAccountJWT";

export async function accessProvableApi(
  currency: CryptoCurrency,
  viewKey: string | undefined,
  initialAccount?: AleoAccount,
): Promise<ProvableApi> {
  const provableApi = initialAccount?.aleoResources.provableApi;

  let apiKey = provableApi?.apiKey;
  let consumerId = provableApi?.consumerId;
  let jwt = provableApi?.jwt;
  let uuid = provableApi?.uuid;
  let synced: boolean | undefined = provableApi?.scannerStatus?.synced ?? false;
  let percentage: number | undefined = provableApi?.scannerStatus?.percentage ?? 0;

  if (initialAccount && viewKey) {
    if (!apiKey || !consumerId) {
      const username = new Date().getTime().toString() + initialAccount.id;

      const { key, consumer } = await apiClient.registerNewAccount(currency, username);

      apiKey = key;
      consumerId = consumer.id;
    }

    console.log(initialAccount.id);

    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (!jwt || currentTimestamp >= jwt.exp - 5 * 60) {
      jwt = await getAccountJWT(currency, apiKey, consumerId);
    }

    if (!uuid) {
      const { uuid: accountUuid } = await apiClient.registerForScanningAccountRecords(
        currency,
        jwt.token,
        viewKey,
      );
      uuid = accountUuid;
    }

    const status = await apiClient.getRecordScannerStatus(currency, jwt.token, uuid);
    if (status) {
      synced = status.synced;
      percentage = status.percentage;
    }
  }

  console.log("[DEBUG]", apiKey, consumerId, jwt, uuid, synced, percentage);

  return {
    apiKey,
    consumerId,
    jwt,
    uuid,
    scannerStatus: { synced, percentage },
  };
}
