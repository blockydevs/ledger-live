import React, { useState } from "react";
import { ScrollView } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  BottomSheetHeader,
  BottomSheetView,
  Box,
  Button,
  Card,
  CardContent,
  CardContentDescription,
  CardContentTitle,
  CardFooter,
  CardFooterActions,
  CardHeader,
  CardLeading,
  DescriptionItem,
  DescriptionItemLabel,
  DescriptionItemValue,
  Spot,
  Text,
} from "@ledgerhq/lumen-ui-rnative";
import { DeleteCircleFill, InformationFill } from "@ledgerhq/lumen-ui-rnative/symbols";
import type { Account } from "@ledgerhq/types-live";
import { shortAddressPreview } from "@ledgerhq/live-common/account/helpers";
import { getMaxTrustLimitForToken } from "@ledgerhq/live-common/families/xrp/logicPublic";
import type { XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import { TrackScreen } from "@shared/analytics-react";
import { QueuedBottomSheet } from "@shared/ui-queued-bottom-sheet";
import { useAccountScreen } from "LLM/hooks/useAccountScreen";
import CurrencyIcon from "~/components/CurrencyIcon";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";
import SafeAreaView from "~/components/SafeAreaView";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import type { StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { NavigatorName, ScreenName } from "~/const";
import { useTranslation } from "~/context/Locale";
import { useAccountName } from "~/reducers/wallet";
import { hasPendingRemoval } from "./utils";

type Props = StackNavigatorProps<BaseNavigatorStackParamList, ScreenName.XrpManageAssets>;

const options = {
  title: "",
};

function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <DescriptionItem>
      <DescriptionItemLabel>{label}</DescriptionItemLabel>
      <DescriptionItemValue>{children}</DescriptionItemValue>
    </DescriptionItem>
  );
}

function TokenCard({
  account,
  tokenAccount,
  onDelete,
}: Readonly<{ account: Account; tokenAccount: XrpTokenAccount; onDelete: () => void }>) {
  const { t } = useTranslation();
  const { token, xrpResources } = tokenAccount;
  const isIou = token.tokenType === "iou";
  const limit = xrpResources?.limit;

  return (
    <Card type="info" testID={`xrp-manage-asset-${token.id}`}>
      <CardHeader>
        <CardLeading>
          <CurrencyIcon size={40} currency={token} />
          <CardContent>
            <CardContentTitle>{token.name}</CardContentTitle>
            <CardContentDescription>
              {shortAddressPreview(account.freshAddress)}
            </CardContentDescription>
          </CardContent>
        </CardLeading>
      </CardHeader>
      <CardFooter>
        <Row label={t("xrp.manageAssets.tokenType")}>
          {isIou ? t("xrp.manageAssets.iou") : t("xrp.manageAssets.mpt")}
        </Row>
        <Row label={t("xrp.manageAssets.issuer")}>{shortAddressPreview(token.contractAddress)}</Row>
        {isIou && limit ? (
          <Row label={t("xrp.tokenSettings.limit")}>
            {limit.gte(getMaxTrustLimitForToken()) ? (
              t("xrp.tokenSettings.maximum")
            ) : (
              <CurrencyUnitValue unit={token.units[0]} value={limit} showCode />
            )}
          </Row>
        ) : null}
        {isIou ? (
          <Row label={t("xrp.rippling.label")}>
            {xrpResources?.isRippling ? t("xrp.rippling.on") : t("xrp.rippling.off")}
          </Row>
        ) : null}
        <CardFooterActions>
          <Button
            appearance="base"
            size="sm"
            isFull
            disabled={xrpResources?.isLocked}
            onPress={onDelete}
            testID={`xrp-manage-asset-delete-${token.id}`}
          >
            {t("xrp.manageAssets.delete")}
          </Button>
        </CardFooterActions>
      </CardFooter>
    </Card>
  );
}

const DELETE_COPY = {
  confirm: {
    title: "xrp.manageAssets.confirm.title",
    description: "xrp.manageAssets.confirm.description",
    cta: "common.continue",
  },
  balanceBlocked: {
    title: "xrp.manageAssets.balanceBlocked.title",
    description: "xrp.manageAssets.balanceBlocked.description",
    cta: "common.gotit",
  },
} as const;

function DeleteDrawerContent({
  account,
  tokenAccount,
  onClose,
}: Readonly<{ account: Account; tokenAccount: XrpTokenAccount; onClose: () => void }>) {
  const { t } = useTranslation();
  const navigation = useNavigation<Props["navigation"]>();
  const accountName = useAccountName(account);
  const { token } = tokenAccount;
  const isHoldingBalance = tokenAccount.balance.gt(0);
  const copy = isHoldingBalance ? DELETE_COPY.balanceBlocked : DELETE_COPY.confirm;

  const onContinue = () => {
    onClose();
    navigation.navigate(NavigatorName.XrpRemoveTokenFlow, {
      screen: ScreenName.XrpRemoveTokenReview,
      params: { accountId: tokenAccount.id, parentId: account.id, token },
    });
  };

  return (
    <Box lx={{ alignItems: "center", padding: "s16", paddingBottom: "s24", gap: "s24" }}>
      <Spot
        size={72}
        appearance={isHoldingBalance ? "error" : "muted"}
        icon={isHoldingBalance ? DeleteCircleFill : InformationFill}
      />
      <Box lx={{ alignItems: "center", gap: "s8" }}>
        <Text typography="heading4SemiBold" lx={{ color: "base", textAlign: "center" }}>
          {t(copy.title, { token: token.ticker })}
        </Text>
        <Text typography="body2" lx={{ color: "muted", textAlign: "center" }}>
          {t(copy.description, { token: token.ticker, account: accountName })}
        </Text>
      </Box>
      <Button
        appearance="base"
        size="lg"
        lx={{ width: "full" }}
        onPress={isHoldingBalance ? onClose : onContinue}
        testID="xrp-manage-asset-drawer-cta"
      >
        {t(copy.cta)}
      </Button>
    </Box>
  );
}

function DeleteDrawer({
  account,
  tokenAccount,
  onClose,
}: Readonly<{ account: Account; tokenAccount?: XrpTokenAccount; onClose: () => void }>) {
  return (
    <QueuedBottomSheet
      isRequestingToBeOpened={!!tokenAccount}
      onClose={onClose}
      enableDynamicSizing
    >
      <BottomSheetView>
        <BottomSheetHeader />
        {tokenAccount ? (
          <DeleteDrawerContent account={account} tokenAccount={tokenAccount} onClose={onClose} />
        ) : null}
      </BottomSheetView>
    </QueuedBottomSheet>
  );
}

function ManageAssets() {
  const { t } = useTranslation();
  const route = useRoute<Props["route"]>();
  const { account } = useAccountScreen(route);
  const [tokenAccountToDelete, setTokenAccountToDelete] = useState<XrpTokenAccount>();
  if (account?.type !== "Account") return null;

  // A removed token stays out of the list, as it does on the account screen
  const tokenAccounts = (account.subAccounts ?? []).filter(
    (subAccount): subAccount is XrpTokenAccount =>
      subAccount.type === "TokenAccount" &&
      !!(subAccount as XrpTokenAccount).xrpResources &&
      !hasPendingRemoval(account, subAccount.token),
  );

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} isFlex>
      <TrackScreen category="XrpManageAssets" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text typography="heading2SemiBold" lx={{ color: "base" }}>
          {t("xrp.manageAssets.title")}
        </Text>
        {tokenAccounts.length === 0 ? (
          <Box>
            <Text typography="body2" lx={{ color: "muted" }}>
              {t("xrp.manageAssets.empty")}
            </Text>
          </Box>
        ) : (
          tokenAccounts.map(tokenAccount => (
            <TokenCard
              key={tokenAccount.id}
              account={account}
              tokenAccount={tokenAccount}
              onDelete={() => setTokenAccountToDelete(tokenAccount)}
            />
          ))
        )}
      </ScrollView>
      <DeleteDrawer
        account={account}
        tokenAccount={tokenAccountToDelete}
        onClose={() => setTokenAccountToDelete(undefined)}
      />
    </SafeAreaView>
  );
}

export { ManageAssets as component, options };
