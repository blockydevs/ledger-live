import React from "react";
import { ScrollView } from "react-native";
import { Box, Button, Text } from "@ledgerhq/lumen-ui-rnative";
import { TrackScreen } from "@shared/analytics-react";
import Alert from "~/components/Alert";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";
import SafeAreaView from "~/components/SafeAreaView";
import { useTranslation } from "~/context/Locale";
import { ErrorBanner, Row, Value } from "../ReviewRows";
import { useReviewViewModel } from "./useReviewViewModel";

function BalanceBlocked({ balance, onSend }: Readonly<{ balance?: string; onSend: () => void }>) {
  const { t } = useTranslation();

  return (
    <Box lx={{ padding: "s16", gap: "s16" }} testID="xrp-remove-balance-blocked">
      <Text typography="body1" lx={{ color: "base" }}>
        {balance
          ? t("xrp.removeToken.steps.review.balanceBlocked", { balance })
          : t("xrp.removeToken.steps.review.balanceBlockedNoAmount")}
      </Text>
      <Button appearance="base" size="lg" isFull onPress={onSend} testID="xrp-remove-send">
        {t("xrp.removeToken.steps.review.send")}
      </Button>
    </Box>
  );
}

export default function Review() {
  const { t } = useTranslation();
  const viewModel = useReviewViewModel();

  if (viewModel.isBalanceBlocked) {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} isFlex>
        <TrackScreen category="XrpRemoveTokenFlow" name="ReviewBalanceBlocked" />
        <BalanceBlocked balance={viewModel.heldBalance} onSend={viewModel.onSend} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} isFlex>
      <TrackScreen category="XrpRemoveTokenFlow" name="Review" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Row label={t("xrp.removeToken.steps.review.token")}>
          <Value>{`${viewModel.token.name} (${viewModel.token.ticker})`}</Value>
        </Row>
        <Row label={t("xrp.removeToken.steps.review.issuer")}>
          <Value>{viewModel.token.contractAddress}</Value>
        </Row>
        {viewModel.unlockedAmount ? (
          <Row label={t("xrp.removeToken.steps.review.unlockedAmount")}>
            <Value>{viewModel.unlockedAmount}</Value>
          </Row>
        ) : null}
        <Row label={t("xrp.removeToken.steps.review.networkFees")}>
          <Value>
            <CurrencyUnitValue
              unit={viewModel.accountUnit}
              value={viewModel.estimatedFees}
              showCode
            />
          </Value>
        </Row>
        <Text typography="body2" lx={{ color: "muted" }}>
          {t("xrp.removeToken.steps.review.info")}
        </Text>
        {viewModel.isIou ? (
          <Alert type="primary" testID="xrp-remove-device-limit">
            {t("xrp.removeToken.steps.review.deviceLimit")}
          </Alert>
        ) : null}
        {viewModel.errors.map(error => (
          <ErrorBanner key={error.name} error={error} />
        ))}
        {viewModel.warnings.map(warning => (
          <ErrorBanner key={warning.name} error={warning} warning />
        ))}
      </ScrollView>
      <Box lx={{ padding: "s16" }}>
        <Button
          appearance="base"
          size="lg"
          isFull
          disabled={viewModel.isContinueDisabled}
          loading={viewModel.isContinueLoading}
          onPress={viewModel.onContinue}
          testID="xrp-remove-continue"
        >
          {t("common.continue")}
        </Button>
      </Box>
    </SafeAreaView>
  );
}
