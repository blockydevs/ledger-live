import React from "react";
import { CryptoIcon } from "@ledgerhq/crypto-icons";
import { getValidCryptoIconSize } from "~/renderer/utils/cryptoIconSize";
import { AssetHeader } from "./components/AssetHeader";
import { ActionBar } from "./components/ActionBar";
import { HiddenBanner } from "./components/HiddenBanner";
import { MarketPriceSection } from "./components/MarketPriceSection";
import { AddressListSection } from "./components/AddressList";
import { MarketDataSection } from "./components/MarketDataSection";
import { MetricsRowSection } from "./components/MetricsRowSection";
import { TotalBalance } from "./components/TotalBalance";
import { TransactionsSection } from "./components/TransactionsSection";
import type { AssetDetailReady } from "./types";

type AssetDetailViewProps = Readonly<{
  viewModel: AssetDetailReady;
}>;

export function AssetDetailView({ viewModel }: AssetDetailViewProps) {
  const { distributionItem, marketData, displayTicker, ledgerId, ledgerCurrency } = viewModel;

  return (
    <div className="flex w-full shrink-0 flex-col gap-24 pb-32">
      <AssetHeader
        assetTicker={displayTicker}
        icon={
          ledgerId && (
            <CryptoIcon
              ledgerId={ledgerId}
              ticker={displayTicker}
              size={getValidCryptoIconSize(24)}
            />
          )
        }
        distributionItem={distributionItem}
        marketData={marketData}
        ledgerCurrency={ledgerCurrency}
      />

      {ledgerCurrency && <HiddenBanner currency={ledgerCurrency} />}

      <MarketPriceSection
        distributionItem={distributionItem}
        ledgerId={ledgerId}
        marketData={marketData}
      />

      <ActionBar
        distributionItem={distributionItem}
        ledgerCurrency={ledgerCurrency}
        marketCurrencyData={marketData.marketCurrencyData}
        tickerHint={displayTicker}
      />

      <div className="flex flex-col gap-32">
        {distributionItem && distributionItem.accounts.length > 0 && (
          <TotalBalance distributionItem={distributionItem} />
        )}

        {distributionItem && <MetricsRowSection distributionItem={distributionItem} />}

        {distributionItem && distributionItem.accounts.length > 0 && (
          <AddressListSection distributionItem={distributionItem} />
        )}

        {marketData.marketCurrencyData && <MarketDataSection marketData={marketData} />}

        {distributionItem && <TransactionsSection distributionItem={distributionItem} />}
      </div>
    </div>
  );
}
