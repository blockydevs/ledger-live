import React, { memo } from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "styled-components/native";
import Wallet from "@ledgerhq/icons-ui/native/Wallet";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";

import SummaryRowCustom from "./SummaryRowCustom";
import Circle from "~/components/Circle";
import LText from "~/components/LText";
import CurrencyIcon from "~/components/CurrencyIcon";

interface Props {
  token: TokenCurrency;
}

function SummaryFromSection({ token }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <SummaryRowCustom
      label={t("hedera.associate.summary.from")}
      iconLeft={
        <Circle bg={colors.palette.opacityDefault.c05} size={34}>
          <Wallet size="S" color={colors.palette.primary.c80} />
        </Circle>
      }
      data={
        <View
          style={{
            flexDirection: "row",
            gap: 4,
          }}
        >
          <View style={styles.currencyIcon}>
            <CurrencyIcon size={16} forceIconScale={2} currency={token} circle />
          </View>
          <LText numberOfLines={1} style={styles.summaryRowText}>
            {token.name}
          </LText>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  summaryRowText: {
    fontSize: 16,
    textAlign: "right",
  },
  currencyIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default memo<Props>(SummaryFromSection);
