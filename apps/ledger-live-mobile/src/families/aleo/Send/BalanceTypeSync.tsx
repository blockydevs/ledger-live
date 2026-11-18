import React, { useLayoutEffect } from "react";
import { View } from "react-native";
import { Box, Button, Spinner, Spot, Text } from "@ledgerhq/lumen-ui-rnative";
import { useStyleSheet } from "@ledgerhq/lumen-ui-rnative/styles";
import { DeleteCircleFill, InformationFill } from "@ledgerhq/lumen-ui-rnative/symbols";
import { isAleoAccount, isPrivateTransaction } from "@ledgerhq/live-common/families/aleo/utils";
import type { AleoAccount, Transaction } from "@ledgerhq/live-common/families/aleo/types";
import SafeAreaView from "~/components/SafeAreaView";
import { StatusGradient } from "LLM/components/StatusGradient";
import type { BalanceTypeSyncProps } from "~/screens/SendFunds/utils/customSendFlow";
import {
  useBalanceTypeSyncViewModel,
  type BalanceTypeSyncViewModel,
} from "./useBalanceTypeSyncViewModel";

type PrivateSyncProps = Readonly<{
  account: AleoAccount;
  transaction: Transaction;
  onComplete: () => void;
  onClose: () => void;
}>;

const STATUS_STYLE = {
  error: { spot: { appearance: "error", icon: DeleteCircleFill }, tone: "error" },
  recordLimit: { spot: { appearance: "muted", icon: InformationFill }, tone: "info" },
} as const;

function BalanceTypeSyncView({ viewModel }: Readonly<{ viewModel: BalanceTypeSyncViewModel }>) {
  const styles = useStyleSheet(
    theme => ({
      container: { flex: 1, backgroundColor: theme.colors.bg.base },
      gradient: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    }),
    [],
  );
  const isSyncing = viewModel.status === "syncing";

  return (
    <SafeAreaView
      style={styles.container}
      edges={["bottom"]}
      testID={`aleo-balance-type-sync-${viewModel.status}`}
    >
      {isSyncing ? null : (
        <View pointerEvents="none" style={styles.gradient}>
          <StatusGradient tone={STATUS_STYLE[viewModel.status].tone} />
        </View>
      )}
      <Box lx={{ flex: 1, paddingHorizontal: "s16", paddingVertical: "s24" }}>
        <Box lx={{ flex: 1, alignItems: "center", justifyContent: "center", gap: "s24" }}>
          {isSyncing ? (
            <Spinner size={32} />
          ) : (
            <Spot {...STATUS_STYLE[viewModel.status].spot} size={72} />
          )}
          <Box lx={{ gap: "s8", alignItems: "center" }}>
            <Text typography="heading4SemiBold" lx={{ color: "base", textAlign: "center" }}>
              {viewModel.title}
            </Text>
            <Text typography="body2" lx={{ color: "muted", textAlign: "center" }}>
              {isSyncing ? viewModel.progressLabel : viewModel.description}
            </Text>
          </Box>
        </Box>
        {viewModel.status === "error" ? (
          <Box lx={{ gap: "s16" }}>
            <Button appearance="base" size="lg" isFull onPress={viewModel.onRetry}>
              {viewModel.retryLabel}
            </Button>
            <Button appearance="gray" size="lg" isFull onPress={viewModel.onCancel}>
              {viewModel.cancelLabel}
            </Button>
          </Box>
        ) : null}
        {viewModel.status === "recordLimit" ? (
          <Button appearance="base" size="lg" isFull onPress={viewModel.onContinue}>
            {viewModel.continueLabel}
          </Button>
        ) : null}
      </Box>
    </SafeAreaView>
  );
}

function PrivateSync(props: PrivateSyncProps) {
  const viewModel = useBalanceTypeSyncViewModel(props);
  return <BalanceTypeSyncView viewModel={viewModel} />;
}

function SkipSync({ onComplete }: Readonly<{ onComplete: () => void }>) {
  useLayoutEffect(() => {
    onComplete();
  }, [onComplete]);
  return null;
}

export function BalanceTypeSync({
  account,
  transaction,
  onComplete,
  onClose,
}: BalanceTypeSyncProps) {
  const isPrivateAleoSend =
    isAleoAccount(account) && transaction.family === "aleo" && isPrivateTransaction(transaction);

  if (!isPrivateAleoSend) return <SkipSync onComplete={onComplete} />;

  return (
    <PrivateSync
      account={account}
      transaction={transaction}
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}
