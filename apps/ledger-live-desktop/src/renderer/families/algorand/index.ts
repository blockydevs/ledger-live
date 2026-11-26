import operationDetails from "./operationDetails";
import tokenList from "./TokenList";
import addAssetAction from "./addAssetAction";
import { AlgorandFamily } from "./types";

const family: AlgorandFamily = {
  operationDetails,
  tokenList,
  addAssetAction,
  modalsToPreload: ["MODAL_ALGORAND_OPT_IN"],
};

export default family;
