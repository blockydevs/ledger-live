import { Account } from "@ledgerhq/live-e2e-shared/enum/Account";
import { shareViewKeyCommand } from "@ledgerhq/live-e2e-shared/families/aleo";
import { runNewSendFlowTest } from "@e2e/specs/send/newSendFlow";
import { FF_NEW_SEND_FLOW_ENABLED } from "@e2e/utils/featureFlagUtils";

runNewSendFlowTest(
  new Transaction(Account.ALEO_1, Account.ALEO_2, "0.000001"),
  ["B2CQA-6703"],
  ["@NanoSP", "@NanoX", "@Stax", "@Flex", "@NanoGen5", "@aleo", "@family-aleo"],
  {
    featureFlags: { ...FF_NEW_SEND_FLOW_ENABLED, currencyAleo: { enabled: true } },
    liveDataOptions: { postSeedHook: shareViewKeyCommand(Account.ALEO_1) },
    publicBalance: true,
  },
);
