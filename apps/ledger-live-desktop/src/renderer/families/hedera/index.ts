import { getTransactionExplorer } from "@ledgerhq/live-common/families/hedera/logic";
import AccountSubHeader from "./AccountSubHeader";
import NoAssociatedAccounts from "./NoAssociatedAccounts";
import sendRecipientFields from "./SendRecipientFields";
import StepReceiveAccountCustomAlert from "./StepReceiveAccountCustomAlert";
import StepRecipientCustomAlert from "./StepRecipientCustomAlert";
import StepReceiveFunds from "./StepReceiveFunds";
import { HederaFamily } from "./types";
import tokenList from "./TokenList";
import { sendRecipientCanNext } from "./sendRecipientCanNext";

const family: HederaFamily = {
  sendRecipientFields,
  tokenList,
  AccountSubHeader,
  StepReceiveAccountCustomAlert,
  StepReceiveFunds,
  StepRecipientCustomAlert,
  NoAssociatedAccounts,
  getTransactionExplorer,
  sendRecipientCanNext,
};

export default family;
