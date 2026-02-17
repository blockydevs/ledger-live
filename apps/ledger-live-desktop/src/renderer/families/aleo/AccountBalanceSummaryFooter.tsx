import React, { useEffect, useState } from "react";
import { Trans } from "react-i18next";
import styled from "styled-components";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import type { TokenAccount } from "@ledgerhq/types-live";
import { localeSelector } from "~/renderer/reducers/settings";
import Discreet, { useDiscreetMode } from "~/renderer/components/Discreet";
import Box from "~/renderer/components/Box/Box";
import Text from "~/renderer/components/Text";
import InfoCircle from "~/renderer/icons/InfoCircle";
import ToolTip from "~/renderer/components/Tooltip";
import { useAccountUnit } from "~/renderer/hooks/useAccountUnit";
import ButtonV3 from "~/renderer/components/ButtonV3";
import { t, TFunction } from "i18next";
import { Pause, Refresh } from "@ledgerhq/lumen-ui-react/symbols";
import Spinner from "~/renderer/components/Spinner";
import { useSelector } from "LLD/hooks/redux";
// import { openModal } from "~/renderer/actions/modals";
import { BigNumber } from "bignumber.js";

type AleoSyncState = "disabled" | "running" | "paused" | "complete" | "outdated";

const ActionButton = ({
  t,
  syncState,
  updateSyncState,
}: {
  t: TFunction<"translation", undefined>;
  syncState: AleoSyncState;
  updateSyncState: () => void;
}) => {
  switch (syncState) {
    case "disabled":
      return (
        <ButtonV3
          variant="main"
          onClick={updateSyncState}
          buttonTestId="show-private-balance-button"
        >
          <Text>{t("aleo.privateRecords.state.showBalance")}</Text>
        </ButtonV3>
      );
    case "paused":
      return (
        <ButtonV3
          variant="main"
          Icon={<Refresh size={20} />}
          style={{ padding: "100%" }}
          onClick={updateSyncState}
        />
      );
    case "running":
      return (
        <ButtonV3
          variant="main"
          Icon={<Pause size={20} />}
          style={{ padding: "100%" }}
          onClick={updateSyncState}
        />
      );
    case "outdated":
      return (
        <ButtonV3
          variant="main"
          Icon={<Refresh size={20} />}
          style={{ padding: "100%" }}
          onClick={updateSyncState}
        />
      );
  }
};

const getSafeProgress = (account: AleoAccount | TokenAccount): number => {
  if (
    account.type === "Account" &&
    "aleoResources" in account &&
    account.aleoResources?.provableApi?.scannerStatus?.percentage !== null &&
    account.aleoResources?.provableApi?.scannerStatus?.percentage !== undefined
  ) {
    return account.aleoResources.provableApi.scannerStatus.percentage;
  }

  return 0;
};

interface Props {
  account: AleoAccount | TokenAccount;
}

const AccountBalanceSummaryFooter: React.FC<Props> = ({ account }) => {
  const [syncState, setSyncState] = useState<AleoSyncState>("disabled");
  const [progress, setProgress] = useState<number>(() => getSafeProgress(account));
  const [privateBalance, setPrivateBalance] = useState<BigNumber>(
    account.aleoResources?.privateBalance ?? BigNumber(0),
  );
  const discreet = useDiscreetMode();
  const locale = useSelector(localeSelector);
  const unit = useAccountUnit(account);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let isMounted = true;

    async function fetchProgressAndBalance() {
      // You may need to get these from props/context or adjust as needed
      const { currency, aleoResources } = account as AleoAccount;
      const jwt = aleoResources?.jwt;
      const uuid = aleoResources?.uuid;
      const apiClient = aleoResources?.apiClient;

      if (!currency || !jwt?.token || !uuid || !apiClient) return;

      if (progress < 100) {
        interval = setInterval(async () => {
          try {
            const status = await apiClient.getRecordScannerStatus(currency, jwt.token, uuid);
            if (status && isMounted) {
              setProgress(status.percentage ?? 0);
            }
          } catch (e) {
            // handle error if needed
          }
        }, 3000);
      } else {
        try {
          if (apiClient.getPrivateBalance) {
            const privateBalanceResult = await apiClient.getPrivateBalance(
              currency,
              jwt.token,
              uuid,
            );
            if (privateBalanceResult && isMounted) {
              setPrivateBalance(privateBalanceResult.balance);
            }
          }
        } catch (e) {
          // handle error if needed
        }
      }
    }

    fetchProgressAndBalance();

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [progress, account]);

  const formatConfig = {
    alwaysShowSign: false,
    showCode: true,
    discreet,
    locale,
  };

  const spendableBalance = account.spendableBalance;
  const transparentBalance = account.aleoResources?.transparentBalance ?? BigNumber(0);
  const privateBalance = account.aleoResources?.privateBalance ?? BigNumber(0);

  const formattedAvailableBalance = formatCurrencyUnit(unit, spendableBalance, formatConfig);
  const formattedTransparentBalance = formatCurrencyUnit(unit, transparentBalance, formatConfig);
  const formattedPrivateBalance = privateBalance
    ? formatCurrencyUnit(unit, privateBalance, formatConfig)
    : "***";

  const updateSyncState = () => {
    switch (syncState) {
      case "disabled":
        // Run block processing task
        setSyncState("running");
        break;
      case "running":
        // Pause block processing task
        setSyncState("paused");
        break;
      case "paused":
        // Resume block processing task
        setSyncState("running");
        break;
      case "outdated":
        // Start sync from the last known block
        setSyncState("running");
        break;
    }
  };

  return (
    <Wrapper>
      <BalanceDetail>
        <ToolTip content={<Trans i18nKey="aleo.account.availableBalanceTooltip" />}>
          <TitleWrapper>
            <Title>
              <Trans i18nKey="aleo.account.availableBalance" />
            </Title>
            <InfoCircle size={13} />
          </TitleWrapper>
        </ToolTip>
        <AmountValue>
          <Discreet>{formattedAvailableBalance}</Discreet>
        </AmountValue>
      </BalanceDetail>
      <BalanceDetail>
        <ToolTip content={<Trans i18nKey="aleo.account.transparentBalanceTooltip" />}>
          <TitleWrapper>
            <Title>
              <Trans i18nKey="aleo.account.transparentBalance" />
            </Title>
            <InfoCircle size={13} />
          </TitleWrapper>
        </ToolTip>
        <AmountValue>
          <Discreet>{formattedTransparentBalance}</Discreet>
        </AmountValue>
      </BalanceDetail>
      <BalanceDetail style={{ flexDirection: "row", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ToolTip content={<Trans i18nKey="aleo.account.privateBalanceTooltip" />}>
            <TitleWrapper>
              <Title>
                <Trans i18nKey="aleo.account.privateBalance" />
              </Title>
              <InfoCircle size={13} />
            </TitleWrapper>
          </ToolTip>
          <AmountValue>
            <Discreet>{formattedPrivateBalance}</Discreet>
          </AmountValue>
        </div>
        <div style={{ display: "flex", paddingLeft: "30px" }}>
          {syncState !== "disabled" ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              {syncState === "running" ? <Spinner size={14} /> : null}
              {syncState === "paused" ? <Text>Paused at </Text> : null}
              <Text style={{ paddingLeft: "3px", paddingRight: "10px" }}>{progress}%</Text>
            </div>
          ) : null}
          <div>
            <ActionButton t={t} syncState={syncState} updateSyncState={updateSyncState} />
          </div>
        </div>
      </BalanceDetail>
    </Wrapper>
  );
};

const Wrapper = styled(Box).attrs(() => ({
  horizontal: true,
  mt: 4,
  p: 5,
  pb: 0,
  scroll: true,
}))`
  border-top: 1px solid ${p => p.theme.colors.neutral.c30};
`;

const BalanceDetail = styled(Box).attrs(() => ({
  flex: "0.25 0 auto",
  alignItems: "start",
  paddingRight: 20,
}))``;

const TitleWrapper = styled(Box).attrs(() => ({
  horizontal: true,
  alignItems: "center",
  mb: 1,
}))``;

const Title = styled(Text).attrs(() => ({
  fontSize: 4,
  ff: "Inter|Medium",
  color: "neutral.c70",
}))`
  line-height: ${p => p.theme.space[4]}px;
  margin-right: ${p => p.theme.space[1]}px;
`;

const AmountValue = styled(Text).attrs(() => ({
  fontSize: 6,
  ff: "Inter|SemiBold",
  color: "neutral.c100",
}))<{ paddingRight?: number }>`
  ${p => p.paddingRight && `padding-right: ${p.paddingRight}px`};
`;

export default AccountBalanceSummaryFooter;
