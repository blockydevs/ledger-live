import invariant from "invariant";
import { BigNumber } from "bignumber.js";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Trans } from "react-i18next";
import { useAccountBridge } from "@ledgerhq/live-common/bridge/useAccountBridge";
import { XRP_DEV_TOKENS } from "@ledgerhq/live-common/families/xrp/devTokens";
import {
  MAX_TRUST_LIMIT_VALUE,
  getIssuerFeeForToken,
  isMaxTrustLimitValue,
} from "@ledgerhq/live-common/families/xrp/logicPublic";
import { formatAddress } from "@ledgerhq/live-common/utils/addressUtils";
import { Transaction, XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import { TokenCurrency } from "@domain/entity-currency-token";
import { TrackScreen } from "@shared/analytics-react";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import Ellipsis from "~/renderer/components/Ellipsis";
import ErrorBanner from "~/renderer/components/ErrorBanner";
import FirstLetterIcon from "~/renderer/components/FirstLetterIcon";
import InputCurrency from "~/renderer/components/InputCurrency";
import Label from "~/renderer/components/Label";
import Select from "~/renderer/components/Select";
import Switch from "~/renderer/components/Switch";
import Text from "~/renderer/components/Text";
import ToolTip from "~/renderer/components/Tooltip";
import Alert from "~/renderer/components/Alert";
import InfoCircle from "~/renderer/icons/InfoCircle";
import AccountFooter from "~/renderer/modals/Send/AccountFooter";
import logger from "~/renderer/logger";
import { ACTION_I18N, StepProps } from "../types";

// TEMP prototype: the CAL lists no XRPL token yet, so the choices are the hardcoded dev tokens
export function findDevToken(transaction: Transaction) {
  return XRP_DEV_TOKENS.find(token => {
    const isSameCurrency = token.tokenIdentifier === transaction.assetReference;
    const isSameIssuer = token.contractAddress === transaction.assetOwner;
    return isSameCurrency && isSameIssuer;
  });
}

// Null when the node fails: the row is then left out
async function fetchIssuerFee(token: TokenCurrency): Promise<string | null> {
  try {
    return await getIssuerFeeForToken(token);
  } catch (issuerFeeError) {
    logger.critical(issuerFeeError);
    return null;
  }
}

function useIssuerFee(token: TokenCurrency | undefined): string | null {
  const [issuerFee, setIssuerFee] = useState<{ tokenId: string; percent: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!token) return;
    let isCurrent = true;
    fetchIssuerFee(token).then(percent => {
      if (isCurrent) setIssuerFee({ percent, tokenId: token.id });
    });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  return issuerFee && issuerFee.tokenId === token?.id ? issuerFee.percent : null;
}

function renderToken(option: { data: TokenCurrency }) {
  const token = option.data;

  return (
    <Box key={token.id} horizontal alignItems="center" width="100%">
      <Box noShrink mr={2}>
        <FirstLetterIcon label={token.name} />
      </Box>
      <Ellipsis ff="Inter|Medium">{token.name}</Ellipsis>
      <Text fontSize={3} color="neutral.c60" ml={2}>
        {token.ticker}
      </Text>
      <Text fontSize={3} color="neutral.c60" ml="auto" pl={3} title={token.contractAddress}>
        {formatAddress(token.contractAddress)}
      </Text>
    </Box>
  );
}

export default function StepToken({
  account,
  parentAccount,
  onUpdateTransaction,
  transaction,
  warning,
  error,
  t,
  action,
  tokenAccount,
}: StepProps) {
  invariant(account && transaction, "account and transaction required");

  const bridge = useAccountBridge<Transaction>(account, parentAccount);
  const [isLimitTyped, setIsLimitTyped] = useState(false);

  // A removed token keeps its token account, for its history, but no resources: it can be added again
  const heldTokenIds = useMemo(() => {
    const heldTokenAccounts = (account.subAccounts ?? []).filter(sub => {
      return sub.type === "TokenAccount" && !!(sub as XrpTokenAccount).xrpResources;
    });

    return new Set(heldTokenAccounts.map(sub => sub.token.id));
  }, [account]);

  const options = useMemo(() => {
    return XRP_DEV_TOKENS.filter(token => {
      const isOnAccountCurrency = token.parentCurrencyId === account.currency.id;
      return isOnAccountCurrency && !heldTokenIds.has(token.id);
    });
  }, [account, heldTokenIds]);

  const selectedToken = tokenAccount?.token ?? findDevToken(transaction);
  const isIou = selectedToken?.tokenType === "iou";
  const hasLimitInput = isIou && action !== "remove";

  const isMaxLimit = isMaxTrustLimitValue(transaction.amount);

  const isRippling = transaction.noRipple === false;

  const issuerFee = useIssuerFee(action === "remove" ? undefined : selectedToken);

  const isUntypedZeroLimit = error?.name === "XrpTrustLimitZero" && !isLimitTyped;
  const visibleError = isUntypedZeroLimit ? undefined : error;

  // An IOU's limit is the transaction amount, prefilled with Max. An MPToken has no limit
  const onChange = useCallback(
    (token?: TokenCurrency | null) => {
      if (!token?.tokenIdentifier) return;
      setIsLimitTyped(false);

      const limit = token.tokenType === "iou" ? MAX_TRUST_LIMIT_VALUE : new BigNumber(0);

      // The currency code or MPT issuance id is the tokenIdentifier: the name is only for display
      onUpdateTransaction(tx => {
        return bridge.updateTransaction(tx, {
          assetReference: token.tokenIdentifier,
          assetOwner: token.contractAddress,
          amount: limit,
        });
      });
    },
    [bridge, onUpdateTransaction],
  );

  const onLimitChange = useCallback(
    (limit: BigNumber) => {
      onUpdateTransaction(tx => bridge.updateTransaction(tx, { amount: limit }));
    },
    [bridge, onUpdateTransaction],
  );

  const onCustomLimit = useCallback(() => {
    setIsLimitTyped(false);
    onLimitChange(new BigNumber(0));
  }, [onLimitChange]);

  const onRipplingChange = useCallback(
    (isChecked: boolean) => {
      onUpdateTransaction(tx => bridge.updateTransaction(tx, { noRipple: !isChecked }));
    },
    [bridge, onUpdateTransaction],
  );

  return (
    <Box flow={1}>
      <TrackScreen category="XRP add token" name="Step 1" />
      {warning && !visibleError ? <ErrorBanner error={warning} warning /> : null}
      {visibleError ? <ErrorBanner error={visibleError} /> : null}
      <Box flow={1} mb={4}>
        <Select
          value={selectedToken}
          options={options}
          getOptionValue={token => token.id}
          getOptionLabel={token => `${token.name} ${token.ticker} ${token.contractAddress}`}
          renderValue={renderToken}
          renderOption={renderToken}
          placeholder={t("xrp.addToken.steps.token.selectLabel")}
          noOptionsMessage={input => t("common.selectNoResults", { query: input.inputValue })}
          onChange={onChange}
          isDisabled={!!tokenAccount}
        />
      </Box>
      {selectedToken && issuerFee !== null ? (
        <Box horizontal alignItems="center" justifyContent="space-between" mb={4}>
          <ToolTip content={<Trans i18nKey="xrp.addToken.steps.token.issuerFeeTooltip" />}>
            <Box horizontal alignItems="center" color="neutral.c70">
              <Text fontSize={3} mr={1}>
                <Trans i18nKey="xrp.addToken.steps.token.issuerFee" />
              </Text>
              <InfoCircle size={12} />
            </Box>
          </ToolTip>
          <Text ff="Inter|SemiBold" fontSize={3} color="neutral.c100">
            {`${issuerFee}%`}
          </Text>
        </Box>
      ) : null}
      {hasLimitInput && selectedToken ? (
        <Box flow={1} mb={4}>
          <Label>
            <Trans i18nKey="xrp.addToken.steps.token.limitLabel" />
          </Label>
          {isMaxLimit ? (
            <Box
              horizontal
              alignItems="center"
              justifyContent="space-between"
              data-testid="xrp-trust-limit-max"
            >
              <Text ff="Inter|SemiBold" fontSize={4} color="neutral.c100">
                <Trans i18nKey="xrp.addToken.steps.token.limitMaximum" />
              </Text>
              <Button small outline onClick={onCustomLimit}>
                <Trans i18nKey="xrp.addToken.steps.token.limitCustom" />
              </Button>
            </Box>
          ) : (
            <InputCurrency
              defaultUnit={selectedToken.units[0]}
              value={transaction.amount}
              onChange={onLimitChange}
              onInput={() => setIsLimitTyped(true)}
              renderRight={
                <Button small mr={1} onClick={() => onLimitChange(MAX_TRUST_LIMIT_VALUE)}>
                  <Trans i18nKey="xrp.addToken.steps.token.limitMax" />
                </Button>
              }
            />
          )}
          <Box horizontal alignItems="center" justifyContent="space-between" mt={3}>
            <ToolTip
              content={
                <Trans
                  i18nKey="xrp.tokenAccount.rippling.explanation"
                  values={{ token: selectedToken.name }}
                />
              }
            >
              <Box horizontal alignItems="center" color="neutral.c70">
                <Text fontSize={3} mr={1}>
                  <Trans i18nKey="xrp.tokenAccount.rippling.allow" />
                </Text>
                <InfoCircle size={12} />
              </Box>
            </ToolTip>
            <Box data-testid="xrp-rippling-switch">
              <Switch isChecked={isRippling} onChange={onRipplingChange} />
            </Box>
          </Box>
          {isRippling ? (
            <Alert type="warning" mt={2}>
              <Trans
                i18nKey="xrp.tokenAccount.rippling.explanation"
                values={{ token: selectedToken.name }}
              />
            </Alert>
          ) : null}
        </Box>
      ) : null}
      <Alert type="primary">
        <Trans i18nKey={`${ACTION_I18N[action]}.steps.token.info`} />
      </Alert>
    </Box>
  );
}

export function StepTokenFooter({
  transitionTo,
  account,
  parentAccount,
  onClose,
  status,
  bridgePending,
  transaction,
}: StepProps) {
  invariant(account, "account required");

  const hasErrors = Object.keys(status.errors).length > 0;
  const hasSelectedToken = !!transaction?.assetReference && !!transaction?.assetOwner;
  const isReady = !bridgePending && !hasErrors;
  const canNext = isReady && hasSelectedToken;

  return (
    <>
      <AccountFooter parentAccount={parentAccount} account={account} status={status} />
      <Box horizontal>
        <Button mr={1} onClick={onClose}>
          <Trans i18nKey="common.cancel" />
        </Button>
        <Button
          disabled={!canNext}
          isLoading={bridgePending}
          primary
          onClick={() => transitionTo("connectDevice")}
        >
          <Trans i18nKey="common.continue" />
        </Button>
      </Box>
    </>
  );
}
