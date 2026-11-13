import React, { useCallback } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SyncOneAccountOnMount } from "@ledgerhq/live-common/bridge/react/index";
import { Box } from "@ledgerhq/lumen-ui-rnative";
import { TrackScreen } from "@shared/analytics-react";
import PreventNativeBack from "~/components/PreventNativeBack";
import ValidateSuccess from "~/components/ValidateSuccess";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import type {
  BaseComposite,
  StackNavigatorNavigation,
  StackNavigatorProps,
} from "~/components/RootNavigator/types/helpers";
import { ScreenName } from "~/const";
import { useTranslation } from "~/context/Locale";
import { readStringField } from "../utils";
import type { XrpRemoveTokenFlowParamList } from "./types";

type Props = BaseComposite<
  StackNavigatorProps<XrpRemoveTokenFlowParamList, ScreenName.XrpRemoveTokenValidationSuccess>
>;

export default function ValidationSuccess() {
  const { t } = useTranslation();
  const navigation = useNavigation<Props["navigation"]>();
  const route = useRoute<Props["route"]>();
  const { accountId, token, result, status } = route.params;
  const unlockedAmount = readStringField(status.warnings.reserve, "amount");

  const onClose = useCallback(() => {
    navigation.getParent<StackNavigatorNavigation<BaseNavigatorStackParamList>>().pop();
  }, [navigation]);

  const onViewDetails = useCallback(() => {
    navigation.navigate(ScreenName.OperationDetails, { accountId, operation: result });
  }, [accountId, navigation, result]);

  return (
    <Box lx={{ flex: 1, backgroundColor: "canvas" }}>
      <TrackScreen category="XrpRemoveTokenFlow" name="ValidationSuccess" />
      <PreventNativeBack />
      <SyncOneAccountOnMount
        reason="transaction-flow-confirmation"
        priority={10}
        accountId={accountId}
      />
      <ValidateSuccess
        onClose={onClose}
        onViewDetails={onViewDetails}
        title={t("xrp.removeToken.success.title", { token: token.name })}
        description={
          unlockedAmount
            ? t("xrp.removeToken.success.text", { amount: unlockedAmount })
            : t("xrp.removeToken.success.textNoReserve")
        }
      />
    </Box>
  );
}
