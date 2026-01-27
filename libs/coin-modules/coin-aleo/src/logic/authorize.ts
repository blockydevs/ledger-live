import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import type { AleoAccount, ProvableApi } from "../types";
import type { AleoJWT, AleoRegisterAccountResponse } from "../types/api";
import { apiClient } from "../network/api";
import { getAccountJWT } from "./getAccountJWT";

export async function authorize(
  currency: CryptoCurrency,
  viewKey: string | undefined,
  initialAccount?: AleoAccount,
): Promise<ProvableApi> {
  const provableApi = initialAccount?.aleoResources.provableApi;

  let apiKey: AleoRegisterAccountResponse["key"] = provableApi?.apiKey ?? "";
  let consumerId: AleoRegisterAccountResponse["consumer"]["id"] = provableApi?.consumerId ?? "";
  let jwt: AleoJWT = provableApi?.jwt ?? { token: "", exp: 0 };
  let uuid: string = provableApi?.uuid ?? "";

  if (initialAccount && viewKey) {
    if (!apiKey || !consumerId) {
      const username = new Date().getTime().toString() + initialAccount.freshAddress.slice(4, 15);

      const { key, consumer } = await apiClient.registerNewAccount(currency, username);

      apiKey = key;
      consumerId = consumer.id;
    }
    console.log("DEBUG", jwt, jwt.exp);
    if (jwt.exp <= Math.floor(Date.now() / 1000)) {
      jwt = await getAccountJWT(currency, apiKey, consumerId);
    }
    console.log("DEBUG 2", jwt, jwt.exp);

    if (!uuid) {
      const { uuid: accountUuid } = await apiClient.registerForScanningAccountRecords(
        currency,
        jwt.token,
        viewKey,
      );
      uuid = accountUuid;
    }

    await apiClient.getRecordScannerStatus(currency, jwt.token, uuid);
  }

  return {
    apiKey,
    consumerId,
    jwt,
    uuid,
  };
}
