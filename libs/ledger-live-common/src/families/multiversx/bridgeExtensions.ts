import type { AccountBridgeExtensions } from "@ledgerhq/types-live";
import { MULTIVERSX_DUMMY_ADDRESS } from "@ledgerhq/coin-multiversx/constants";

const extensions: AccountBridgeExtensions = {
  getEstimationRecipient: () => MULTIVERSX_DUMMY_ADDRESS,
};

export default extensions;
