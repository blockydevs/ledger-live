import { useLayoutEffect, useMemo } from "react";
import { type CatalogItem } from "../../components/Catalog/Catalog.native";
import { CATEGORY_ICONS } from "../../categoryConfig.native";
import { useDevToolsShell } from "../../context";
import type { CategoriesScreenProps } from "../navigation.native";

export interface CategoriesScreenViewProps {
  items: CatalogItem[];
}

export function useCategoriesScreenViewModel({
  navigation,
}: CategoriesScreenProps): CategoriesScreenViewProps {
  const { categories } = useDevToolsShell();

  useLayoutEffect(() => {
    navigation.setOptions({ title: "DevTools" });
  }, [navigation]);

  const items = useMemo<CatalogItem[]>(
    () =>
      categories.map(({ category, tools }) => ({
        key: category,
        title: category,
        logo: CATEGORY_ICONS[category],
        count: tools.length,
        onPress: () => navigation.push("tools", { category }),
      })),
    [categories, navigation],
  );

  return { items };
}
