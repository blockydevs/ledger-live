import { createAction } from "redux-actions";
import { BorrowActionTypes } from "./types";
import type {
  BorrowSetInfoBottomSheetPayload,
  BorrowSetErrorBottomSheetPayload,
} from "./types";

export const makeSetBorrowInfoBottomSheetAction = createAction<BorrowSetInfoBottomSheetPayload>(
  BorrowActionTypes.BORROW_INFO_BOTTOM_SHEET,
);

export const makeSetBorrowErrorBottomSheetAction = createAction<BorrowSetErrorBottomSheetPayload>(
  BorrowActionTypes.BORROW_ERROR_BOTTOM_SHEET,
);
