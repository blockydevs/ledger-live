import type { AccountBridge } from "@ledgerhq/types-live";
import { apiClient } from "../network/api";
import type { AleoAccount } from "../types";

export const privateSync: AccountBridge<AleoAccount>["privateSync"] = account =>
  new Promise((resolve, reject) => {
    const { currency, aleoJWT, apiKey, uuid } = account.aleoResources.provableApi || {};
    let isSynced = false;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const statusResp = await apiClient.getRecordScannerStatus(currency, aleoJWT, uuid);
        if (statusResp && statusResp.synced === true) {
          if (intervalId) clearInterval(intervalId);
          isSynced = true;
          try {
            const records = await apiClient.getAccountOwnedRecords({
              currency,
              jwtToken: aleoJWT,
              apiKey,
              uuid,
              unspent: true,
            });
            resolve({ status: "success", data: { status: statusResp, records } });
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
