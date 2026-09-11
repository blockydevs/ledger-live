import React, { useMemo } from "react";
import { Platform } from "react-native";
import { useTranslation } from "~/context/Locale";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@react-navigation/native";
import { ScreenName } from "~/const";
import { getStackNavigatorConfig } from "~/navigation/navigatorConfig";
import StepHeader from "~/components/StepHeader";
import ConnectDevice from "~/screens/ConnectDevice";
import { useNotificationsPrompt } from "LLM/features/NotificationsPrompt";
import SelectDevice from "./SelectDevice";
import ValidationSuccess from "./ValidationSuccess";
import ValidationError from "./ValidationError";
import type { ClaimUnbondFlowParamList } from "./types";

function ClaimUnbondFlow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { notifyFlowCompleted } = useNotificationsPrompt();
  const stackNavigatorConfig = useMemo(() => getStackNavigatorConfig(colors, true), [colors]);

  return (
    <Stack.Navigator
      screenOptions={{
        ...stackNavigatorConfig,
        gestureEnabled: Platform.OS === "ios",
      }}
    >
      <Stack.Screen
        name={ScreenName.AleoClaimUnbondSelectDevice}
        component={SelectDevice}
        options={{
          headerTitle: () => <StepHeader title={t("aleo.claim.stepperHeader.selectDevice")} />,
        }}
      />
      <Stack.Screen
        name={ScreenName.AleoClaimUnbondConnectDevice}
        component={ConnectDevice}
        options={{
          gestureEnabled: false,
          headerTitle: () => <StepHeader title={t("aleo.claim.stepperHeader.connectDevice")} />,
        }}
      />
      <Stack.Screen
        name={ScreenName.AleoClaimUnbondValidationSuccess}
        component={ValidationSuccess}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
        listeners={{ beforeRemove: () => notifyFlowCompleted("stake") }}
      />
      <Stack.Screen
        name={ScreenName.AleoClaimUnbondValidationError}
        component={ValidationError}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

const Stack = createNativeStackNavigator<ClaimUnbondFlowParamList>();
const options = { headerShown: false };
export { ClaimUnbondFlow as component, options };
