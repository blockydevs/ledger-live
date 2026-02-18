import type { AccountBridge } from "@ledgerhq/types-live";
import { apiClient } from "../network/api";
import type { AleoAccount, Transaction as AleoTransaction } from "../types";
import { getPrivateBalance } from "../logic/getPrivateBalance";
import { getViewKey } from "../logic/utils";

export const privateSync: AccountBridge<AleoTransaction, AleoAccount>["privateSync"] = account =>
  new Promise((resolve, reject) => {
    const viewKey = getViewKey(account);
    const provableApi = account?.aleoResources?.provableApi;

    if (!provableApi || !provableApi.jwt || !provableApi.apiKey || !provableApi.uuid) {
      reject({ status: "error", data: "Missing provableApi credentials" });
      return;
    }

    const { jwt, apiKey, uuid } = provableApi;

    let isSynced: boolean = false;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const statusResp = await apiClient.getRecordScannerStatus(
          account.currency,
          jwt.token,
          uuid,
        );
        if (statusResp && statusResp.synced === true) {
          if (intervalId) clearInterval(intervalId);
          isSynced = true;
          try {
            const privateRecords = await apiClient.getAccountOwnedRecords({
              currency: account.currency,
              jwtToken: jwt.token,
              apiKey,
              uuid,
              unspent: true,
            });
            const { balance } = await getPrivateBalance({
              currency: account.currency,
              viewKey,
              privateRecords,
            });
            // @ts-expect-error
            resolve({ status: "success", data: { balance } });
          } catch (err) {
            reject({ status: "error", data: err instanceof Error ? err.message : String(err) });
          }
        }
      } catch (error) {
        if (intervalId) clearInterval(intervalId);
        isSynced = true;
        reject({ status: "error", data: error instanceof Error ? error.message : String(error) });
      }
    };

    intervalId = setInterval(() => {
      if (!isSynced) poll();
    }, 5000);
    poll();
  });
