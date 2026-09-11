import React, { useMemo } from "react";
import { Platform } from "react-native";
import { useTranslation } from "~/context/Locale";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@react-navigation/native";
import { ScreenName } from "~/const";
import { getStackNavigatorConfig } from "~/navigation/navigatorConfig";
import StepHeader from "~/components/StepHeader";
import ConnectDevice from "~/screens/ConnectDevice";
import SelectDevice from "~/screens/SelectDevice";
import { useNotificationsPrompt } from "LLM/features/NotificationsPrompt";
import Amount from "./Amount";
import ValidationSuccess from "./ValidationSuccess";
import ValidationError from "./ValidationError";
import type { UnbondFlowParamList } from "./types";

const totalSteps = "1";

function UnbondFlow() {
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
        name={ScreenName.AleoUnbondAmount}
        component={Amount}
        options={{
          headerTitle: () => (
            <StepHeader
              title={t("aleo.unbond.stepperHeader.amount")}
              subtitle={t("aleo.unbond.stepperHeader.stepRange", {
                currentStep: "1",
                totalSteps,
              })}
            />
          ),
        }}
      />
      <Stack.Screen
        name={ScreenName.AleoUnbondSelectDevice}
        component={SelectDevice}
        options={{
          headerTitle: () => <StepHeader title={t("aleo.unbond.stepperHeader.selectDevice")} />,
        }}
      />
      <Stack.Screen
        name={ScreenName.AleoUnbondConnectDevice}
        component={ConnectDevice}
        options={{
          gestureEnabled: false,
          headerTitle: () => <StepHeader title={t("aleo.unbond.stepperHeader.connectDevice")} />,
        }}
      />
      <Stack.Screen
        name={ScreenName.AleoUnbondValidationSuccess}
        component={ValidationSuccess}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
        listeners={{ beforeRemove: () => notifyFlowCompleted("stake") }}
      />
      <Stack.Screen
        name={ScreenName.AleoUnbondValidationError}
        component={ValidationError}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

const Stack = createNativeStackNavigator<UnbondFlowParamList>();
const options = { headerShown: false };
export { UnbondFlow as component, options };
