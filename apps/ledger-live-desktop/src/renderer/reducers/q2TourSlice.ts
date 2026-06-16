import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { State } from "./index";

export type Q2TourSliceState = {
  hasSeen: boolean;
};

export const q2TourInitialState: Q2TourSliceState = {
  hasSeen: false,
};

const q2TourSlice = createSlice({
  name: "q2Tour",
  initialState: q2TourInitialState,
  reducers: {
    setQ2TourHasSeen: (state, action: PayloadAction<boolean>) => {
      state.hasSeen = action.payload;
    },
    importQ2TourState: (state, action: PayloadAction<Partial<Q2TourSliceState>>) => ({
      ...state,
      ...action.payload,
    }),
  },
});

export const { setQ2TourHasSeen, importQ2TourState } = q2TourSlice.actions;

const selectQ2TourState = (state: State): Q2TourSliceState =>
  state.q2Tour ?? q2TourInitialState;

export const selectQ2TourHasSeen = (state: State): boolean =>
  selectQ2TourState(state).hasSeen;

export const q2TourStoreSelector = selectQ2TourState;

export default q2TourSlice.reducer;
