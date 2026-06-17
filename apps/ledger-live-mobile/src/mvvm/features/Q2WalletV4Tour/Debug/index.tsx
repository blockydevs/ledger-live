import React, { useCallback } from "react";
import { ScrollView } from "react-native";
import { Box, Text, Switch, Button } from "@ledgerhq/lumen-ui-rnative";
import { useFeature } from "@features/platform-feature-flags";
import { setOverride } from "@shared/feature-flags";
import { useDispatch, useSelector } from "~/context/hooks";
import { setHasSeenQ2WalletV4Tour } from "~/actions/settings";
import { hasSeenQ2WalletV4TourSelector } from "~/reducers/settings";

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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Box lx={{ padding: "s16", rowGap: "s24" }}>
        <Text typography="body2" lx={{ color: "muted" }}>
          Test the Q2 Wallet V4 Tour, gated by the lwmWallet40 q2Tour parameter.
        </Text>

        <Box
          lx={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            columnGap: "s12",
          }}
        >
          <Box lx={{ flexShrink: 1 }}>
            <Text typography="body2SemiBold" lx={{ color: "base" }}>
              q2Tour enabled
            </Text>
            <Text typography="body3" lx={{ color: "muted" }}>
              Toggles lwmWallet40.params.q2Tour (also enables lwmWallet40).
            </Text>
          </Box>
          <Switch checked={isQ2TourEnabled} onCheckedChange={handleToggleQ2TourEnabled} />
        </Box>

        <Box
          lx={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            columnGap: "s12",
          }}
        >
          <Box lx={{ flexShrink: 1 }}>
            <Text typography="body2SemiBold" lx={{ color: "base" }}>
              Tour seen
            </Text>
            <Text typography="body3" lx={{ color: "muted" }}>
              Persisted hasSeenQ2WalletV4Tour. Toggle off to replay the tour.
            </Text>
          </Box>
          <Switch
            checked={hasSeenQ2WalletV4Tour}
            onCheckedChange={handleToggleHasSeenQ2WalletV4Tour}
          />
        </Box>

        <Box lx={{ flex: 1, justifyContent: "flex-end" }}>
          <Button size="lg" appearance="accent" disabled>
            Open Drawer (coming soon)
          </Button>
        </Box>
      </Box>
    </ScrollView>
  );
}

export default Q2WalletV4TourScreenDebug;
