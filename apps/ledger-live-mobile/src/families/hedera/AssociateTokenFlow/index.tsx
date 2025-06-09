import React, { useMemo } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { createStackNavigator } from "@react-navigation/stack";
import { useTheme } from "@react-navigation/native";
import { getStackNavigatorConfig, defaultNavigationOptions } from "~/navigation/navigatorConfig";
import StepHeader from "~/components/StepHeader";
import { ScreenName } from "~/const";
import SelectToken from "./01-SelectToken";
import { HederaAssociateTokenFlowParamList } from "./types";
import { NavigationHeaderBackButton } from "~/components/NavigationHeaderBackButton";
import { NavigationHeaderCloseButtonAdvanced } from "~/components/NavigationHeaderCloseButton";

function AssociateTokenFlow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const stackNavigationConfig = useMemo(() => getStackNavigatorConfig(colors, true), [colors]);

  return (
    <Stack.Navigator
      screenOptions={{
        ...stackNavigationConfig,
        gestureEnabled: Platform.OS === "ios",
      }}
    >
      <Stack.Screen
        name={ScreenName.HederaAssociateTokenSelectToken}
        component={SelectToken}
        options={{
          headerLeft: () => <NavigationHeaderBackButton />,
          headerTitle: "",
          headerRight: () => <NavigationHeaderCloseButtonAdvanced />,
        }}
      />
    </Stack.Navigator>
  );
}

const options = {
  headerShown: false,
};

export { AssociateTokenFlow as component, options };

const Stack = createStackNavigator<HederaAssociateTokenFlowParamList>();
