import { BigNumber } from "bignumber.js";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import { usePortfolioPnL } from "@ledgerhq/wallet-pnl/hooks";
import { useSelector } from "~/context/hooks";
import { shallowAccountsSelector } from "~/reducers/accounts";
import { useCountervaluesState } from "~/reducers/countervalues";
import { counterValueCurrencySelector } from "~/reducers/settings";
import { usePnlViewModelBase } from "LLM/features/Pnl/hooks/usePnlViewModelBase";
import type { PnlViewModel } from "LLM/features/Pnl/types";

const ZERO = new BigNumber(0);
const EMPTY_ACCOUNTS: Parameters<typeof usePortfolioPnL>[0] = [];

export function usePnlSectionViewModel(): PnlViewModel {
  const { shouldDisplayPnl } = useWalletFeaturesConfig("mobile");
  const accounts = useSelector(shallowAccountsSelector);
  const countervalues = useCountervaluesState();
  const fiat = useSelector(counterValueCurrencySelector);

  // Skip the (potentially expensive) portfolio walk when the section is hidden.
  const pnl = usePortfolioPnL(shouldDisplayPnl ? accounts : EMPTY_ACCOUNTS, countervalues, fiat);
  const { costBasis = ZERO } = pnl;

  return usePnlViewModelBase({
    namespace: "pnl.portfolio",
    pnlData: pnl,
    secondaryCard: {
      id: "costBasis",
      titleKey: "pnl.portfolio.costBasis.title",
      tooltipKey: "pnl.portfolio.costBasis.tooltip",
      value: costBasis,
    },
    accountsCount: accounts.length,
  });
}
