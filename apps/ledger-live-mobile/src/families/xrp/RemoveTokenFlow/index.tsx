import React, { useMemo } from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@react-navigation/native";
import { NavigationHeaderBackButton } from "~/components/NavigationHeaderBackButton";
import { NavigationHeaderCloseButtonAdvanced } from "~/components/NavigationHeaderCloseButton";
import { ScreenName } from "~/const";
import { useTranslation } from "~/context/Locale";
import { bridgeSuspenseScreenLayout, getStackNavigatorConfig } from "~/navigation/navigatorConfig";
import ConnectDevice from "~/screens/ConnectDevice";
import SelectDevice from "~/screens/SelectDevice";
import Review from "./Review";
import ValidationError from "./ValidationError";
import ValidationSuccess from "./ValidationSuccess";
import type { XrpRemoveTokenFlowParamList } from "./types";

const Stack = createNativeStackNavigator<XrpRemoveTokenFlowParamList>();

const options = {
  headerShown: false,
};

function RemoveTokenFlow() {
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
        name={ScreenName.XrpRemoveTokenReview}
        component={Review}
        options={{
          headerLeft: () => <NavigationHeaderBackButton />,
          headerTitle: t("xrp.removeToken.steps.review.title"),
          headerRight: () => <NavigationHeaderCloseButtonAdvanced />,
        }}
      />
      <Stack.Screen
        name={ScreenName.XrpRemoveTokenSelectDevice}
        component={SelectDevice}
        options={{ headerTitle: t("xrp.removeToken.steps.selectDevice.title") }}
      />
      <Stack.Screen
        name={ScreenName.XrpRemoveTokenConnectDevice}
        component={ConnectDevice}
        options={{
          headerLeft: undefined,
          gestureEnabled: false,
          headerTitle: t("xrp.removeToken.steps.connectDevice.title"),
        }}
      />
      <Stack.Screen
        name={ScreenName.XrpRemoveTokenValidationError}
        component={ValidationError}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name={ScreenName.XrpRemoveTokenValidationSuccess}
        component={ValidationSuccess}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}

export { RemoveTokenFlow as component, options };
