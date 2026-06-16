import reducer, {
  INITIAL_STATE,
  borrowInfoBottomSheetSelector,
  borrowErrorBottomSheetSelector,
} from "../borrow";
import {
  makeSetBorrowInfoBottomSheetAction,
  makeSetBorrowErrorBottomSheetAction,
} from "../../actions/borrow";
import type { State } from "../types";

describe("borrow reducer", () => {
  describe("BORROW_INFO_BOTTOM_SHEET", () => {
    it("sets infoBottomSheet from payload", () => {
      const payload = { title: "Borrow info", message: "Some help text" };
      const state = reducer(INITIAL_STATE, makeSetBorrowInfoBottomSheetAction(payload));

      expect(state.infoBottomSheet).toEqual(payload);
    });

    it("sets infoBottomSheet to undefined when payload is undefined", () => {
      const state = reducer(INITIAL_STATE, makeSetBorrowInfoBottomSheetAction(undefined));

      expect(state.infoBottomSheet).toBeUndefined();
    });
  });

  describe("BORROW_ERROR_BOTTOM_SHEET", () => {
    const payload = {
      title: "Borrow failed",
      description: "The provider rejected your request.",
      ctaLabel: "Retry",
    };

    it("sets errorBottomSheet from payload", () => {
      const state = reducer(INITIAL_STATE, makeSetBorrowErrorBottomSheetAction(payload));

      expect(state.errorBottomSheet).toEqual(payload);
    });

    it("sets errorBottomSheet to undefined when payload is undefined", () => {
      const stateWithSheet = reducer(
        INITIAL_STATE,
        makeSetBorrowErrorBottomSheetAction(payload),
      );
      const state = reducer(stateWithSheet, makeSetBorrowErrorBottomSheetAction(undefined));

      expect(state.errorBottomSheet).toBeUndefined();
    });

    it("preserves infoBottomSheet when updating errorBottomSheet", () => {
      const infoPayload = { title: "Info", message: "Help" };
      const baseState = reducer(INITIAL_STATE, makeSetBorrowInfoBottomSheetAction(infoPayload));
      const state = reducer(baseState, makeSetBorrowErrorBottomSheetAction(payload));

      expect(state.infoBottomSheet).toEqual(infoPayload);
      expect(state.errorBottomSheet).toEqual(payload);
    });

    it("preserves errorBottomSheet when updating infoBottomSheet", () => {
      const infoPayload = { title: "Info", message: "Help" };
      const baseState = reducer(INITIAL_STATE, makeSetBorrowErrorBottomSheetAction(payload));
      const state = reducer(baseState, makeSetBorrowInfoBottomSheetAction(infoPayload));

      expect(state.infoBottomSheet).toEqual(infoPayload);
      expect(state.errorBottomSheet).toEqual(payload);
    });
  });
});

describe("borrowInfoBottomSheetSelector", () => {
  it("returns infoBottomSheet from borrow state", () => {
    const infoBottomSheet = { title: "Info", message: "Help" };
    const state: State = {
      ...({} as State),
      borrow: { ...INITIAL_STATE, infoBottomSheet },
    };

    expect(borrowInfoBottomSheetSelector(state)).toEqual(infoBottomSheet);
  });

  it("returns undefined when infoBottomSheet is initial", () => {
    const state: State = {
      ...({} as State),
      borrow: INITIAL_STATE,
    };

    expect(borrowInfoBottomSheetSelector(state)).toBeUndefined();
  });
});

describe("borrowErrorBottomSheetSelector", () => {
  it("returns errorBottomSheet from borrow state", () => {
    const errorBottomSheet = {
      title: "Borrow failed",
      description: "Reason",
      ctaLabel: "Retry",
    };
    const state: State = {
      ...({} as State),
      borrow: { ...INITIAL_STATE, errorBottomSheet },
    };

    expect(borrowErrorBottomSheetSelector(state)).toEqual(errorBottomSheet);
  });

  it("returns undefined when errorBottomSheet is initial", () => {
    const state: State = {
      ...({} as State),
      borrow: INITIAL_STATE,
    };

    expect(borrowErrorBottomSheetSelector(state)).toBeUndefined();
  });
});
