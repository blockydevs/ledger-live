import React, { useCallback, useMemo } from "react";
import { FlatList } from "react-native";
import { useSelector } from "react-redux";
import { NavigatorName, ScreenName } from "~/const";
import { TrackScreen } from "~/analytics";
import { Trans } from "react-i18next";
import { Flex, Text } from "@ledgerhq/native-ui";
import { CryptoOrTokenCurrency } from "@ledgerhq/types-cryptoassets";
import { getEnv } from "@ledgerhq/live-env";
import SafeAreaView from "~/components/SafeAreaView";
import { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { HederaAssociateTokenFlowParamList } from "~/families/hedera/AssociateTokenFlow/types";
import BigCurrencyRow from "~/components/BigCurrencyRow";
import FilteredSearchBar from "~/components/FilteredSearchBar";
import { accountScreenSelector, flattenAccountsSelector } from "~/reducers/accounts";
import { listTokens } from "@ledgerhq/live-common/lib/currencies/index";
import { getMainAccount } from "@ledgerhq/coin-framework/lib/account/helpers";

type Props = BaseComposite<
  StackNavigatorProps<HederaAssociateTokenFlowParamList, ScreenName.HederaAssociateTokenSelectToken>
>;

const SEARCH_KEYS = getEnv("CRYPTO_ASSET_SEARCH_KEYS");

const keyExtractor = (currency: CryptoOrTokenCurrency) => currency.id;

const renderEmptyList = () => (
  <Flex px={6}>
    <Text textAlign="center">
      <Trans i18nKey="common.noCryptoFound" />
    </Text>
  </Flex>
);

// FIXME:
// - actions tracking if needed
// - i18n
export default function SelectToken({ navigation, route }: Props) {
  const accounts = useSelector(flattenAccountsSelector);
  const list = useMemo(() => listTokens().filter(t => t.parentCurrency.id === "hedera"), []);
  const { account, parentAccount } = useSelector(accountScreenSelector(route));
  const mainAccount = account ? getMainAccount(account, parentAccount) : null;

  const onPressItem = useCallback(
    (currency: CryptoOrTokenCurrency) => {
      if (currency.type !== "TokenCurrency") return;

      const subAccount = (mainAccount?.subAccounts ?? []).find(acc => acc.token.id === currency.id);

      if (subAccount) {
        navigation.navigate(NavigatorName.ReceiveFunds, {
          screen: ScreenName.ReceiveConfirmation,
          params: {
            currency,
            accountId: subAccount.id,
            parentId: subAccount.parentId,
          },
        });
      } else {
        console.log("FIXME: redirect to next step", currency.name);
      }
    },
    [accounts, navigation],
  );

  const renderList = useCallback(
    (items: CryptoOrTokenCurrency[]) => (
      <FlatList
        data={items}
        renderItem={({ item }) => (
          <BigCurrencyRow currency={item} onPress={onPressItem} subTitle={item.ticker} />
        )}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />
    ),
    [onPressItem],
  );

  return (
    <SafeAreaView edges={["left", "right"]} isFlex>
      <TrackScreen category="HederaAssociateTokenFlow" name="SelectToken" />
      <Text variant="h4" fontWeight="semiBold" mx={6}>
        {/* FIXME: i18n */}
        Choose a token you want to receive
      </Text>
      {list.length > 0 ? (
        <Flex flex={1} ml={6} mr={6} mt={3}>
          <FilteredSearchBar
            keys={SEARCH_KEYS}
            list={list}
            renderList={renderList}
            renderEmptySearch={renderEmptyList}
          />
        </Flex>
      ) : (
        renderEmptyList()
      )}
    </SafeAreaView>
  );
}
