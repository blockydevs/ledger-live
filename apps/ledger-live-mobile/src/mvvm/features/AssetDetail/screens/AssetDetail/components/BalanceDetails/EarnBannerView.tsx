import React from "react";
import {
  Box,
  Card,
  CardContent,
  CardContentDescription,
  CardContentTitle,
  CardHeader,
  CardLeading,
} from "@ledgerhq/lumen-ui-rnative";
import { Plus } from "@ledgerhq/lumen-ui-rnative/symbols";
import { useTranslation } from "~/context/Locale";
import { ASSET_DETAIL_TEST_IDS } from "LLM/features/AssetDetail/testIds";
import type { LumenViewStyle } from "@ledgerhq/lumen-ui-rnative/styles";

type Props = Readonly<{
  label: string;
  onPress: () => void;
}>;

export function EarnBannerView({ label, onPress }: Props) {
  const { t } = useTranslation();

  return (
    <Card
      onPress={onPress}
      testID={ASSET_DETAIL_TEST_IDS.earnBanner}
      accessibilityLabel={t("assetDetail.balanceDetails.earnBannerAction")}
    >
      <CardHeader>
        <CardLeading>
          <CardContent>
            <CardContentTitle>{label}</CardContentTitle>
            <CardContentDescription>
              {t("assetDetail.balanceDetails.earnBannerSubtitle")}
            </CardContentDescription>
          </CardContent>
        </CardLeading>
        <Box lx={IconWrapper}>
          <Plus size={20} color="base" />
        </Box>
      </CardHeader>
    </Card>
  );
}

const IconWrapper: LumenViewStyle = {
  borderRadius: "full",
  backgroundColor: "mutedTransparent",
  justifyContent: "center",
  alignItems: "center",
  padding: "s10",
};
