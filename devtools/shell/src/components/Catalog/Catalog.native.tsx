import { useMemo } from "react";
import { Box } from "@ledgerhq/lumen-ui-rnative";
import { CatalogRow } from "../CatalogRow/CatalogRow.native";
import type { IconComponent } from "../../categoryConfig.native";

export interface CatalogItem {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly logo?: IconComponent;
  readonly count?: number;
  readonly onPress?: () => void;
}

interface CatalogProps {
  readonly items: CatalogItem[];
  readonly query?: string;
}

export function Catalog({ items, query = "" }: CatalogProps) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? items.filter(
            item =>
              item.title.toLowerCase().includes(q) ||
              (item.description ?? "").toLowerCase().includes(q),
          )
        : items,
    [items, q],
  );

  return (
    <Box>
      {filtered.map(({ key, ...row }) => (
        <CatalogRow key={key} {...row} />
      ))}
    </Box>
  );
}

export default Catalog;
