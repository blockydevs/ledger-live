import type { State } from "./index";
import reducer, {
  importQ2TourState,
  q2TourInitialState,
  selectQ2TourHasSeen,
  setQ2TourHasSeen,
} from "./q2TourSlice";

describe("q2Tour slice", () => {
  it("defaults hasSeen to false", () => {
    expect(q2TourInitialState.hasSeen).toBe(false);
  });

  it("updates hasSeen", () => {
    const state = reducer(q2TourInitialState, setQ2TourHasSeen(true));
    expect(state.hasSeen).toBe(true);
  });

  it("imports persisted state", () => {
    const state = reducer(q2TourInitialState, importQ2TourState({ hasSeen: true }));
    expect(state.hasSeen).toBe(true);
  });

  it("selects hasSeen from store", () => {
    expect(selectQ2TourHasSeen({ q2Tour: { hasSeen: false } } as State)).toBe(false);
  });
});
