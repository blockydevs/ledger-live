import { useLayoutEffect, useMemo } from "react";
import { type CatalogItem } from "../../components/Catalog/Catalog.native";
import { useDevToolsShell } from "../../context";
import type { ToolsScreenProps } from "../navigation.native";

export interface ToolsScreenViewProps {
  items: CatalogItem[];
}

export function useToolsScreenViewModel({
  navigation,
  route,
}: ToolsScreenProps): ToolsScreenViewProps {
  const { category } = route.params;
  const { categories } = useDevToolsShell();

  useLayoutEffect(() => {
    navigation.setOptions({ title: category });
  }, [navigation, category]);

  const tools = useMemo(
    () => categories.find(c => c.category === category)?.tools ?? [],
    [categories, category],
  );

  const items = useMemo<CatalogItem[]>(
    () =>
      tools.map(tool => ({
        key: tool.id,
        title: tool.label,
        description: tool.owner,
        onPress: () => navigation.push("tool", { toolId: tool.id }),
      })),
    [tools, navigation],
  );

  return { items };
}
