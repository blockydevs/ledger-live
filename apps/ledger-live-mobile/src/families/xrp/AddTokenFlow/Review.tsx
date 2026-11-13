import React from "react";
import { ScrollView } from "react-native";
import { Banner, Box, Button } from "@ledgerhq/lumen-ui-rnative";
import { TrackScreen } from "@shared/analytics-react";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";
import SafeAreaView from "~/components/SafeAreaView";
import { useTranslation } from "~/context/Locale";
import { ErrorBanner, Row, Value } from "../ReviewRows";
import { type Props, useReviewViewModel } from "./useReviewViewModel";

export default function Review(props: Props) {
  const { t } = useTranslation();
  const viewModel = useReviewViewModel(props);

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} isFlex>
      <TrackScreen category="XrpAddTokenFlow" name="Review" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Row label={t("xrp.addToken.steps.review.tokenType")}>
          <Value>
            {t(
              viewModel.isIou
                ? "xrp.addToken.steps.review.tokenTypeIou"
                : "xrp.addToken.steps.review.tokenTypeMpt",
            )}
          </Value>
        </Row>
        <Row label={t("xrp.addToken.steps.review.account")}>
          <Value>{viewModel.accountAddress}</Value>
        </Row>
        <Row label={t("xrp.addToken.steps.review.tokenName")}>
          <Value>{`${viewModel.token.name} (${viewModel.token.ticker})`}</Value>
        </Row>
        <Row label={t("xrp.addToken.steps.review.issuer")}>
          <Value>{viewModel.token.contractAddress}</Value>
        </Row>
        <Row label={t("xrp.addToken.steps.review.networkFees")}>
          <Value>
            <CurrencyUnitValue
              unit={viewModel.accountUnit}
              value={viewModel.estimatedFees}
              showCode
            />
          </Value>
        </Row>

        {viewModel.settings ? (
          <>
            <Row label={t("xrp.tokenSettings.limit")}>
              <Value>
                {viewModel.settings.isMaximum ? (
                  t("xrp.tokenSettings.maximum")
                ) : (
                  <CurrencyUnitValue
                    unit={viewModel.token.units[0]}
                    value={viewModel.settings.limit}
                    showCode
                  />
                )}
              </Value>
            </Row>
            <Row label={t("xrp.rippling.label")}>
              <Value>
                {t(viewModel.settings.isRippling ? "xrp.rippling.on" : "xrp.rippling.off")}
              </Value>
            </Row>
          </>
        ) : null}

        {viewModel.notEnoughXrp ? (
          <Banner
            appearance="error"
            title={t("xrp.addToken.errors.notEnoughXrp", {
              minimumAmount: viewModel.notEnoughXrp.minimumAmount,
            })}
            description={
              viewModel.notEnoughXrp.lockedAmount
                ? t("xrp.addToken.errors.notEnoughXrpLocked", {
                    amount: viewModel.notEnoughXrp.lockedAmount,
                  })
                : undefined
            }
            primaryAction={
              <Button
                appearance="gray"
                size="sm"
                onPress={viewModel.onReceive}
                testID="xrp-receive"
              >
                {t("xrp.addToken.receive")}
              </Button>
            }
            secondaryAction={
              viewModel.canBuy ? (
                <Button appearance="gray" size="sm" onPress={viewModel.onBuy} testID="xrp-buy">
                  {t("account.buy")}
                </Button>
              ) : undefined
            }
            testID="xrp-not-enough-xrp"
          />
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
          testID="xrp-review-continue"
        >
          {t("common.continue")}
        </Button>
      </Box>
    </SafeAreaView>
  );
}
