import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { type GenericAwarenessModalContentCard } from "@ledgerhq/live-common/genericAwarenessModal";

export type GenericAwarenessModalState = {
  isOpen: boolean;
  campaignId: string | undefined;
  contentCards: GenericAwarenessModalContentCard[];
};

type OpenGenericAwarenessModalDrawerPayload = {
  campaignId?: string;
};

type MarkGenericAwarenessModalContentCardAsReadPayload = {
  id: string;
};

const initialState: GenericAwarenessModalState = {
  isOpen: false,
  campaignId: undefined,
  contentCards: [],
};

const genericAwarenessModalSlice = createSlice({
  name: "genericAwarenessModal",
  initialState,
  reducers: {
    openGenericAwarenessModalDrawer: (
      state,
      action: PayloadAction<OpenGenericAwarenessModalDrawerPayload>,
    ) => {
      state.isOpen = true;
      state.campaignId = action.payload.campaignId;
    },
    closeGenericAwarenessModalDrawer: state => {
      state.isOpen = false;
      state.campaignId = undefined;
    },
    setGenericAwarenessModalCampaignId: (state, action: PayloadAction<string>) => {
      state.campaignId = action.payload;
    },
    setGenericAwarenessModalContentCards: (
      state,
      action: PayloadAction<GenericAwarenessModalContentCard[]>,
    ) => {
      state.contentCards = action.payload;
    },
    markGenericAwarenessModalContentCardAsRead: (
      state,
      action: PayloadAction<MarkGenericAwarenessModalContentCardAsReadPayload>,
    ) => {
      state.contentCards = state.contentCards.filter(card => card.id !== action.payload.id);
    },
  },
  selectors: {
    selectIsGenericAwarenessModalOpen: state => state.isOpen,
    selectGenericAwarenessModalCampaignId: state => state.campaignId,
    selectGenericAwarenessModalContentCards: state => state.contentCards,
    selectCurrentGenericAwarenessModalContentCard: state =>
      state.contentCards.find(card => card.id === state.campaignId),
  },
});

export const {
  openGenericAwarenessModalDrawer,
  closeGenericAwarenessModalDrawer,
  setGenericAwarenessModalCampaignId,
  setGenericAwarenessModalContentCards,
  markGenericAwarenessModalContentCardAsRead,
} = genericAwarenessModalSlice.actions;

export const {
  selectIsGenericAwarenessModalOpen,
  selectGenericAwarenessModalCampaignId,
  selectGenericAwarenessModalContentCards,
  selectCurrentGenericAwarenessModalContentCard,
} = genericAwarenessModalSlice.selectors;

export default genericAwarenessModalSlice.reducer;
