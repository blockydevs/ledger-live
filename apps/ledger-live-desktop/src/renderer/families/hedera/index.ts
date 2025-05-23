import { getTransactionExplorer } from "@ledgerhq/live-common/families/hedera/logic";
import AccountSubHeader from "./AccountSubHeader";
import NoAssociatedAccounts from "./NoAssociatedAccounts";
import sendRecipientFields from "./SendRecipientFields";
import StepReceiveFunds from "./StepReceiveFunds";
import { HederaFamily } from "./types";
import accountActions from "./accountActions";
import tokenList from "./TokenList";

const family: HederaFamily = {
  accountActions,
  sendRecipientFields,
  tokenList,
  AccountSubHeader,
  StepReceiveFunds,
  NoAssociatedAccounts,
  getTransactionExplorer,
};

export default family;
