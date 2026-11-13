import React, { useCallback } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { TrackScreen } from "@shared/analytics-react";
import SafeAreaView from "~/components/SafeAreaView";
import ValidateError from "~/components/ValidateError";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import type {
  BaseComposite,
  StackNavigatorNavigation,
  StackNavigatorProps,
} from "~/components/RootNavigator/types/helpers";
import { ScreenName } from "~/const";
import type { XrpRemoveTokenFlowParamList } from "./types";

type Props = BaseComposite<
  StackNavigatorProps<XrpRemoveTokenFlowParamList, ScreenName.XrpRemoveTokenValidationError>
>;

// A signed removal that fails to broadcast arrives as a TransactionBroadcastError, with its notice
export default function ValidationError() {
  const navigation = useNavigation<Props["navigation"]>();
  const route = useRoute<Props["route"]>();
  const onClose = useCallback(() => {
    navigation.getParent<StackNavigatorNavigation<BaseNavigatorStackParamList>>().pop();
  }, [navigation]);

  const onRetry = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView isFlex>
      <TrackScreen category="XrpRemoveTokenFlow" name="ValidationError" />
      <ValidateError error={route.params.error} onRetry={onRetry} onClose={onClose} />
    </SafeAreaView>
  );
}
