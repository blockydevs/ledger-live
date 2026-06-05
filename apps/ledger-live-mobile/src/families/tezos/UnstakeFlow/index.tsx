import React, { useMemo } from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "~/context/Locale";
import { useTheme } from "@react-navigation/native";
import StepHeader from "~/components/StepHeader";
import { ScreenName } from "~/const";
import { getStackNavigatorConfig, bridgeSuspenseScreenLayout } from "~/navigation/navigatorConfig";
import UnstakeAmount from "./01-Amount";
import UnstakeSelectDevice from "~/screens/SelectDevice";
import UnstakeConnectDevice from "~/screens/ConnectDevice";
import UnstakeValidationSuccess from "./02-ValidationSuccess";
import UnstakeValidationError from "./02-ValidationError";
import type { TezosUnstakeFlowParamList } from "./types";

const totalSteps = "3";

function UnstakeFlow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const stackNavigationConfig = useMemo(() => getStackNavigatorConfig(colors, true), [colors]);
  return (
    <Stack.Navigator
      screenOptions={{
        ...stackNavigationConfig,
        gestureEnabled: Platform.OS === "ios",
      }}
      screenLayout={bridgeSuspenseScreenLayout}
    >
      <Stack.Screen
        name={ScreenName.TezosUnstakeAmount}
        component={UnstakeAmount}
        options={{
          headerLeft: undefined,
          headerTitle: () => (
            <StepHeader
              title={t("send.stepperHeader.selectAmount")}
              subtitle={t("send.stepperHeader.stepRange", {
                currentStep: "1",
                totalSteps,
              })}
            />
          ),
        }}
      />
      <Stack.Screen
        name={ScreenName.TezosUnstakeSelectDevice}
        component={UnstakeSelectDevice}
        options={{
          headerTitle: () => (
            <StepHeader
              title={t("send.stepperHeader.selectDevice")}
              subtitle={t("send.stepperHeader.stepRange", {
                currentStep: "2",
                totalSteps,
              })}
            />
          ),
        }}
      />
      <Stack.Screen
        name={ScreenName.TezosUnstakeConnectDevice}
        component={UnstakeConnectDevice}
        options={{
          headerLeft: undefined,
          gestureEnabled: false,
          headerTitle: () => (
            <StepHeader
              title={t("send.stepperHeader.connectDevice")}
              subtitle={t("send.stepperHeader.stepRange", {
                currentStep: "3",
                totalSteps,
              })}
            />
          ),
        }}
      />
      <Stack.Screen
        name={ScreenName.TezosUnstakeValidationSuccess}
        component={UnstakeValidationSuccess}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name={ScreenName.TezosUnstakeValidationError}
        component={UnstakeValidationError}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

const options = {
  headerShown: false,
};
export { UnstakeFlow as component, options };
const Stack = createNativeStackNavigator<TezosUnstakeFlowParamList>();
