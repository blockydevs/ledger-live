import invariant from "invariant";
import BigNumber from "bignumber.js";
import React, { useCallback, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAccountBridge } from "@ledgerhq/live-common/bridge/useAccountBridge";
import {
  MAX_TRUST_LIMIT_VALUE,
  isMaxTrustLimitValue,
} from "@ledgerhq/live-common/families/xrp/logicPublic";
import type { Transaction } from "@ledgerhq/live-common/families/xrp/types";
import { TrackScreen } from "@shared/analytics-react";
import Alert from "~/renderer/components/Alert";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import ErrorBanner from "~/renderer/components/ErrorBanner";
import Input from "~/renderer/components/Input";
import InputCurrency from "~/renderer/components/InputCurrency";
import Label from "~/renderer/components/Label";
import Switch from "~/renderer/components/Switch";
import Text from "~/renderer/components/Text";
import MaxTrustLimitInfo from "../../MaxTrustLimitInfo";
import type { StepProps } from "../types";

export default function StepSettings({
  account,
  parentAccount,
  transaction,
  status,
  error,
  token,
  isRippling,
  onChangeRippling,
  onUpdateTransaction,
}: StepProps) {
  invariant(account && transaction && token, "xrp: account, transaction and token required");

  const { t } = useTranslation();

  const bridge = useAccountBridge<Transaction>(account, parentAccount);

  const [isLimitTyped, setIsLimitTyped] = useState(false);

  const unit = token.units[0];

  const isMaxLimit = isMaxTrustLimitValue(transaction.amount);

  const limitError = status.errors.amount;

  // A custom limit starts at 0: its error shows once the user types
  const isUntypedZeroLimit = limitError?.name === "XrpTrustLimitZero" && !isLimitTyped;

  const onChangeLimit = useCallback(
    (limit: BigNumber) => {
      onUpdateTransaction(tx => bridge.updateTransaction(tx, { amount: limit }));
    },
    [bridge, onUpdateTransaction],
  );

  const onTypeLimit = useCallback(
    (limit: BigNumber) => {
      setIsLimitTyped(true);
      onChangeLimit(limit);
    },
    [onChangeLimit],
  );

  const onChangeMax = useCallback(
    (isChecked: boolean) => {
      setIsLimitTyped(false);
      onChangeLimit(isChecked ? MAX_TRUST_LIMIT_VALUE : new BigNumber(0));
    },
    [onChangeLimit],
  );

  return (
    <Box flow={1}>
      <TrackScreen category="XRP add token" name="Step Settings" />
      {error ? <ErrorBanner error={error} /> : null}
      <Alert type="primary" mb={2}>
        <Trans i18nKey="xrp.addToken.steps.settings.limitInfo" values={{ token: token.name }} />{" "}
        <MaxTrustLimitInfo unit={unit} />
      </Alert>
      <Box horizontal alignItems="center" justifyContent="space-between">
        <Label>
          <Trans i18nKey="xrp.addToken.steps.settings.limit" />
        </Label>
        <Box horizontal alignItems="center">
          <Text
            color="neutral.c60"
            ff="Inter|Medium"
            fontSize={10}
            style={{ paddingRight: 5 }}
            onClick={() => onChangeMax(!isMaxLimit)}
          >
            <Trans i18nKey="xrp.addToken.steps.settings.max" />
          </Text>
          <Switch
            small
            isChecked={isMaxLimit}
            onChange={onChangeMax}
            data-testid="xrp-trust-limit-max-switch"
          />
        </Box>
      </Box>
      {isMaxLimit ? (
        <Input
          disabled
          ff="Inter"
          value={t("xrp.addToken.steps.settings.maximum")}
          error={limitError}
          data-testid="xrp-trust-limit-max"
        />
      ) : (
        <InputCurrency
          defaultUnit={unit}
          value={transaction.amount}
          onChange={onTypeLimit}
          error={isUntypedZeroLimit ? undefined : limitError}
          allowZero
          data-testid="xrp-trust-limit-input"
        />
      )}
      <Box horizontal alignItems="center" justifyContent="space-between" mt={4}>
        <Label>
          <Trans i18nKey="xrp.rippling.label" />
        </Label>
        <Switch
          isChecked={isRippling}
          onChange={onChangeRippling}
          data-testid="xrp-rippling-switch"
        />
      </Box>
      {isRippling ? (
        <Alert type="warning" mt={2}>
          <Trans i18nKey="xrp.rippling.warning" />
        </Alert>
      ) : null}
    </Box>
  );
}

export function StepSettingsFooter({ transitionTo, status, bridgePending }: StepProps) {
  const hasLimitError = !!status.errors.amount;

  return (
    <Button
      primary
      disabled={hasLimitError || bridgePending}
      isLoading={bridgePending}
      onClick={() => transitionTo("review")}
    >
      <Trans i18nKey="common.continue" />
    </Button>
  );
}
