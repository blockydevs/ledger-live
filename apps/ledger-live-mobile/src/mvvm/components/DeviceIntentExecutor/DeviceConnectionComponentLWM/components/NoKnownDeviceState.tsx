import React from "react";
import { Box, Button, Spot, Text } from "@ledgerhq/lumen-ui-rnative";
import { LedgerDevices } from "@ledgerhq/lumen-ui-rnative/symbols";
import { TrackScreen } from "~/analytics";
import { useTranslation } from "~/context/Locale";
import { useSourceFlow } from "../../utils/SourceFlowContext";
import { PAGE_CONNECT_DEVICE, trackConnectDeviceButtonClicked } from "../../utils/trackDeviceIntent";

type NoKnownDeviceStateProps = {
  onConnectLedgerDevice: () => void;
  onBuyLedgerDevice: () => void;
};

export function NoKnownDeviceState({
  onConnectLedgerDevice,
  onBuyLedgerDevice,
}: Readonly<NoKnownDeviceStateProps>): React.ReactNode {
  const { t } = useTranslation();
  const sourceFlow = useSourceFlow();
  const connectLedgerDeviceLabel = t(
    "deviceIntentExecutor.connectDevice.states.noKnownDevice.connectLedgerDevice",
  );
  const noLedgerDeviceLabel = t("deviceIntentExecutor.connectDevice.states.noKnownDevice.noLedgerDevice");
  const handleConnectLedgerDevice = () => {
    trackConnectDeviceButtonClicked({ sourceFlow, button: connectLedgerDeviceLabel });
    onConnectLedgerDevice();
  };
  const handleBuyLedgerDevice = () => {
    trackConnectDeviceButtonClicked({ sourceFlow, button: noLedgerDeviceLabel });
    onBuyLedgerDevice();
  };

  return (
    <Box lx={{ width: "full", alignItems: "center", gap: "s32" }}>
      <TrackScreen
        category={PAGE_CONNECT_DEVICE.NoKnownDevice}
        sourceFlow={sourceFlow}
        deviceUxV2
      />
      <Box lx={{ width: "full", alignItems: "center", gap: "s24" }}>
        <Spot appearance="icon" icon={LedgerDevices} size={72} />
        <Box lx={{ width: "full", alignItems: "center", gap: "s8" }}>
          <Text typography="heading4SemiBold" lx={{ color: "base", textAlign: "center" }}>
            {t("deviceIntentExecutor.connectDevice.states.noKnownDevice.title")}
          </Text>
          <Text typography="body2" lx={{ color: "muted", textAlign: "center" }}>
            {t("deviceIntentExecutor.connectDevice.states.noKnownDevice.description")}
          </Text>
        </Box>
      </Box>
      <Box lx={{ width: "full", gap: "s16" }}>
        <Button appearance="base" size="lg" lx={{ width: "full" }} onPress={handleConnectLedgerDevice}>
          {connectLedgerDeviceLabel}
        </Button>
        <Button appearance="gray" size="lg" lx={{ width: "full" }} onPress={handleBuyLedgerDevice}>
          {noLedgerDeviceLabel}
        </Button>
      </Box>
    </Box>
  );
}
