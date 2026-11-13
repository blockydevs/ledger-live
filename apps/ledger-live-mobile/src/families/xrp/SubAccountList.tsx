import React from "react";
import { useNavigation } from "@react-navigation/native";
import type { ParamListBase } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Box, Button, Text } from "@ledgerhq/lumen-ui-rnative";
import { Plus } from "@ledgerhq/lumen-ui-rnative/symbols";
import type { CryptoCurrency } from "@domain/entity-currency-crypto";
import type { Account, TokenAccount } from "@ledgerhq/types-live";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import { useTranslation } from "~/context/Locale";
import { hasPendingRemoval, navigateToAddToken } from "./utils";

function AddTokenButton({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();

  return (
    <Button
      appearance="gray"
      size="sm"
      icon={Plus}
      isFull
      lx={{ marginTop: "s12" }}
      onPress={() => navigateToAddToken(navigation, accountId)}
      testID="xrp-add-token-button"
    >
      {t("xrp.addToken.cta")}
    </Button>
  );
}

function Placeholder({ accountId }: Readonly<{ accountId: string }>) {
  const { t } = useTranslation();

  return (
    <Box
      lx={{
        alignItems: "center",
        padding: "s16",
        borderRadius: "md",
        borderWidth: "s1",
        borderColor: "mutedSubtle",
      }}
    >
      <Text typography="body2" lx={{ color: "muted" }}>
        {t("account.tokens.xrp.howTo")}
      </Text>
      <AddTokenButton accountId={accountId} />
    </Box>
  );
}

function getTokenTypes(currency: CryptoCurrency): string[] {
  return getXrpEnabledTokenStandards(currency.id);
}

// The token leaves the list once removed, before the sync that drops its account
function isSubAccountHidden(parentAccount: Account, tokenAccount: TokenAccount): boolean {
  return hasPendingRemoval(parentAccount, tokenAccount.token);
}

export default {
  Placeholder,
  AddTokenButton,
  getTokenTypes,
  isSubAccountHidden,
  hasSpecificTokenWording: true,
};
