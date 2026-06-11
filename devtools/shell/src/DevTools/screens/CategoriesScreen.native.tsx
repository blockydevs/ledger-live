import { Box } from "@ledgerhq/lumen-ui-rnative";
import { WarningBanner } from "../../components/WarningBanner/WarningBanner.native";
import Catalog from "../../components/Catalog/Catalog.native";
import { useCategoriesScreenViewModel } from "./useCategoriesScreenViewModel.native";
import type { CategoriesScreenProps } from "../navigation.native";

export function CategoriesScreen(props: CategoriesScreenProps) {
  const { items } = useCategoriesScreenViewModel(props);

  return (
    <Box>
      <WarningBanner />
      <Catalog items={items} />
    </Box>
  );
}

export default CategoriesScreen;
