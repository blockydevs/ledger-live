import { MakeModalsType } from "~/renderer/modals/types";
import { Data as ReceiveModalProps } from "./ReceiveModal/Body";
import MODAL_HEDERA_RECEIVE from "./ReceiveModal";

export type ModalsData = {
  MODAL_HEDERA_RECEIVE: ReceiveModalProps;
};

const modals: MakeModalsType<ModalsData> = {
  MODAL_HEDERA_RECEIVE,
};

export default modals;
