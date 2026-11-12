import invariant from "invariant";
import React, { useEffect, useState } from "react";
import { Trans } from "react-i18next";
import type { TokenCurrency } from "@domain/entity-currency-token";
import {
  getIssuerFeeForToken,
  isMaxTrustLimitValue,
} from "@ledgerhq/live-common/families/xrp/logicPublic";
import { TrackScreen } from "@shared/analytics-react";
import { useSelector } from "LLD/hooks/redux";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import ErrorBanner from "~/renderer/components/ErrorBanner";
import FormattedVal from "~/renderer/components/FormattedVal";
import Text from "~/renderer/components/Text";
import ToolTip from "~/renderer/components/Tooltip";
import InfoCircle from "~/renderer/icons/InfoCircle";
import logger from "~/renderer/logger";
import AccountFooter from "~/renderer/modals/Send/AccountFooter";
import { localeSelector } from "~/renderer/reducers/settings";
import { formatLongTrustLimit } from "../../utils";
import type { StepProps } from "../types";

function Row({ label, children }: Readonly<{ label: React.ReactNode; children: React.ReactNode }>) {
  return (
    <Box horizontal justifyContent="space-between" alignItems="center" mb={3}>
      <Text ff="Inter|Medium" fontSize={4} color="neutral.c70">
        {label}
      </Text>
      <Box ml={4} style={{ minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

// Null while loading or when the node fails: the row is then left out
function useIssuerFee(token: TokenCurrency | undefined): string | null {
  const [issuerFee, setIssuerFee] = useState<{ tokenId: string; percent: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    let isCurrent = true;

    getIssuerFeeForToken(token)
      .then(percent => {
        if (isCurrent) setIssuerFee({ percent, tokenId: token.id });
      })
      .catch(issuerFeeError => logger.warn("xrp: issuer fee unavailable", issuerFeeError));

    return () => {
      isCurrent = false;
    };
  }, [token]);

  return issuerFee && issuerFee.tokenId === token?.id ? issuerFee.percent : null;
}

export default function StepReview({ transaction, status, token, error, isRippling }: StepProps) {
  invariant(transaction && token, "xrp: transaction and token required");

  const locale = useSelector(localeSelector);

  const longLimit = formatLongTrustLimit(transaction.amount, token.units[0], locale);

  const issuerFee = useIssuerFee(token);

  const errors = Object.values(status.errors);
  const warnings = Object.values(status.warnings);

  return (
    <Box flow={1}>
      <TrackScreen category="XRP add token" name="Step Review" />
      {error ? <ErrorBanner error={error} /> : null}
      {errors.map(statusError => (
        <ErrorBanner key={statusError.name} error={statusError} />
      ))}
      {warnings.map(warning => (
        <ErrorBanner key={warning.name} error={warning} warning />
      ))}
      <Row label={<Trans i18nKey="xrp.addToken.steps.review.token" />}>
        <Text ff="Inter|SemiBold" fontSize={4} color="neutral.c100">
          {`${token.name} (${token.ticker})`}
        </Text>
      </Row>
      <Row label={<Trans i18nKey="xrp.addToken.steps.review.issuer" />}>
        <Text ff="Inter|Regular" fontSize={3} color="neutral.c100" title={token.contractAddress}>
          {token.contractAddress}
        </Text>
      </Row>
      {issuerFee !== null ? (
        <Row
          label={
            <ToolTip content={<Trans i18nKey="xrp.addToken.steps.review.issuerFeeTooltip" />}>
              <Box horizontal alignItems="center">
                <Box mr={1}>
                  <Trans i18nKey="xrp.addToken.steps.review.issuerFee" />
                </Box>
                <InfoCircle size={12} />
              </Box>
            </ToolTip>
          }
        >
          <Text ff="Inter|SemiBold" fontSize={4} color="neutral.c100">
            {`${issuerFee}%`}
          </Text>
        </Row>
      ) : null}
      {token.tokenType === "iou" ? (
        <>
          <Row
            label={
              <ToolTip
                content={
                  <>
                    <Trans i18nKey="xrp.tokenAccount.trustLimitTooltip" />
                    {isMaxTrustLimitValue(transaction.amount) ? (
                      <>
                        {" "}
                        <Trans i18nKey="xrp.tokenAccount.trustLimitMaxTooltip" />
                      </>
                    ) : null}
                  </>
                }
              >
                <Box horizontal alignItems="center">
                  <Box mr={1}>
                    <Trans i18nKey="xrp.addToken.steps.settings.limit" />
                  </Box>
                  <InfoCircle size={12} />
                </Box>
              </ToolTip>
            }
          >
            {longLimit ? (
              <Text ff="Inter|SemiBold" fontSize={4} color="neutral.c100">
                {longLimit}
              </Text>
            ) : (
              <FormattedVal
                val={transaction.amount}
                unit={token.units[0]}
                showCode
                alwaysShowValue
                color="neutral.c100"
                fontSize={4}
              />
            )}
          </Row>
          <Row label={<Trans i18nKey="xrp.rippling.label" />}>
            <Text ff="Inter|SemiBold" fontSize={4} color="neutral.c100">
              <Trans i18nKey={isRippling ? "xrp.rippling.on" : "xrp.rippling.off"} />
            </Text>
          </Row>
        </>
      ) : null}
    </Box>
  );
}

export function StepReviewFooter({
  transitionTo,
  account,
  parentAccount,
  status,
  bridgePending,
}: StepProps) {
  invariant(account, "xrp: account required");
  const hasErrors = Object.keys(status.errors).length > 0;

  return (
    <>
      <AccountFooter account={account} parentAccount={parentAccount} status={status} />
      <Button
        primary
        disabled={hasErrors || bridgePending}
        isLoading={bridgePending}
        onClick={() => transitionTo("connectDevice")}
      >
        <Trans i18nKey="common.continue" />
      </Button>
    </>
  );
}
