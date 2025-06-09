import { ScreenName } from "~/const";

export type HederaAssociateTokenFlowParamList = {
  [ScreenName.HederaAssociateTokenSelectToken]: {
    accountId: string;
  };
};
