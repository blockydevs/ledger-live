import React, { useEffect, useRef, useState } from "react";
import { InteractionManager, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NavBarBackButton, SearchInput } from "@ledgerhq/lumen-ui-rnative";
import { useStyleSheet } from "@ledgerhq/lumen-ui-rnative/styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { track } from "~/analytics";
import { useTranslation } from "~/context/Locale";
import { useExperimental } from "~/experimental";
import { GLOBAL_SEARCH_TEST_IDS } from "./testIds";

export function GlobalSearch() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const hasExperimentalHeader = useExperimental();
  const inputRef = useRef<TextInput>(null);
  const [search, setSearch] = useState("");

  const styles = useStyleSheet(
    theme => ({
      container: {
        flex: 1,
        backgroundColor: theme.colors.bg.base,
      },
      header: {
        flexDirection: "row",
        alignItems: "center",
        minHeight: theme.sizes.s64,
        paddingHorizontal: theme.spacings.s16,
        paddingVertical: theme.spacings.s8,
        gap: theme.spacings.s8,
      },
      searchInputContainer: {
        flex: 1,
      },
    }),
    [],
  );

  const topPadding = hasExperimentalHeader ? 0 : insets.top;

  useEffect(() => {
    track("search_open");

    const task = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  return (
    <View testID={GLOBAL_SEARCH_TEST_IDS.screen} style={styles.container}>
      <View style={{ paddingTop: topPadding }}>
        <View style={styles.header}>
          <NavBarBackButton
            onPress={() => navigation.goBack()}
            accessibilityLabel={t("common.back")}
          />
          <View style={styles.searchInputContainer}>
            <SearchInput
              ref={inputRef}
              testID={GLOBAL_SEARCH_TEST_IDS.searchInput}
              value={search}
              onChangeText={setSearch}
              onClear={() => setSearch("")}
              hideClearButton={false}
              placeholder={t("globalSearch.searchPlaceholder")}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </View>
      </View>
    </View>
  );
}
