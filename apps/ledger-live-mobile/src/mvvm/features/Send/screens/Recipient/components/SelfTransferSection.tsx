import React from "react";
import {
  Box,
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
  Spot,
  Subheader,
  SubheaderRow,
  SubheaderTitle,
} from "@ledgerhq/lumen-ui-rnative";
import { ChevronRight, UserCheck, UserLock } from "@ledgerhq/lumen-ui-rnative/symbols";
import type { SelfTransferSectionViewModel } from "../hooks/useSelfTransferSectionViewModel";

type SelfTransferSectionProps = Readonly<{
  viewModel: NonNullable<SelfTransferSectionViewModel>;
}>;

export function SelfTransferSection({ viewModel }: SelfTransferSectionProps) {
  return (
    <Box lx={{ marginHorizontal: "s8", marginBottom: "s16" }} testID="self-transfer-section">
      <Subheader lx={{ marginBottom: "s12" }}>
        <SubheaderRow>
          <SubheaderTitle>{viewModel.title}</SubheaderTitle>
        </SubheaderRow>
      </Subheader>
      <ListItem onPress={viewModel.onPress} testID="self-transfer-button">
        <ListItemLeading>
          <Spot icon={viewModel.isDestinationPublic ? UserCheck : UserLock} />
          <ListItemContent>
            <ListItemTitle>{viewModel.actionLabel}</ListItemTitle>
          </ListItemContent>
        </ListItemLeading>
        <ListItemTrailing>
          <ChevronRight size={24} />
        </ListItemTrailing>
      </ListItem>
    </Box>
  );
}
