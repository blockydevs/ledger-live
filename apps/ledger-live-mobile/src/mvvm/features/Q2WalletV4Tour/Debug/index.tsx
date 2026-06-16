import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Text, Button } from "@ledgerhq/lumen-ui-rnative";
import { useFeature } from "@features/platform-feature-flags";
import { setOverride } from "@shared/feature-flags";
import { useDispatch, useSelector } from "~/context/hooks";
import { setHasSeenQ2WalletV4Tour } from "~/actions/settings";
import { hasSeenQ2WalletV4TourSelector } from "~/reducers/settings";
import { SectionCard, ToggleRow } from "../../ProductTour/Debug/components";

const WALLET_40_FLAG = "lwmWallet40";

function Q2WalletV4TourScreenDebug() {
  const dispatch = useDispatch();
  const hasSeenQ2WalletV4Tour = useSelector(hasSeenQ2WalletV4TourSelector);
  const lwmWallet40 = useFeature(WALLET_40_FLAG);
  const isQ2TourEnabled = (lwmWallet40?.enabled && lwmWallet40?.params?.q2Tour) ?? false;

  const handleToggleQ2TourEnabled = useCallback(() => {
    const next = !isQ2TourEnabled;
    dispatch(
      setOverride({
        key: WALLET_40_FLAG,
        value: {
          ...lwmWallet40,
          enabled: next ? true : lwmWallet40?.enabled ?? false,
          params: { ...(lwmWallet40?.params ?? {}), q2Tour: next },
        },
      }),
    );
  }, [lwmWallet40, isQ2TourEnabled, dispatch]);

  const handleToggleHasSeenQ2WalletV4Tour = useCallback(() => {
    dispatch(setHasSeenQ2WalletV4Tour(!hasSeenQ2WalletV4Tour));
  }, [dispatch, hasSeenQ2WalletV4Tour]);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <SectionCard>
          <Text typography="body2" lx={{ color: "muted" }}>
            {
              "Allows you to test the image-based Q2 Wallet V4 Tour (gated by lwmWallet40.params.q2Tour)."
            }
          </Text>
        </SectionCard>

        <SectionCard title="Feature Flag">
          <ToggleRow
            label="lwmWallet40 · q2Tour enabled"
            value={isQ2TourEnabled}
            onChange={handleToggleQ2TourEnabled}
            description={
              isQ2TourEnabled
                ? "q2Tour param is enabled (lwmWallet40 enabled). Toggle to disable."
                : "q2Tour param is disabled. Toggle to enable (also enables lwmWallet40)."
            }
          />
        </SectionCard>

        <SectionCard title="Tour State">
          <ToggleRow
            label="Q2 Wallet V4 Tour Seen"
            value={hasSeenQ2WalletV4Tour}
            onChange={handleToggleHasSeenQ2WalletV4Tour}
            description={
              hasSeenQ2WalletV4Tour
                ? "Tour has been seen. Toggle to reset."
                : "Tour has not been seen yet."
            }
          />
        </SectionCard>

        <SectionCard title="Current Configuration">
          <Text typography="body2" lx={{ color: "muted" }}>
            {`Tour State: ${hasSeenQ2WalletV4Tour ? "Seen" : "Not seen"}`}
          </Text>
        </SectionCard>
      </ScrollView>

      <View style={styles.footer}>
        <Button size="lg" appearance="accent" disabled>
          {"Open Drawer (coming soon)"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    marginBottom: 12,
  },
});

export default Q2WalletV4TourScreenDebug;
