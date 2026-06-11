import { Box } from "@ledgerhq/lumen-ui-rnative";
import Catalog from "../../components/Catalog/Catalog.native";
import { useToolsScreenViewModel } from "./useToolsScreenViewModel.native";
import type { ToolsScreenProps } from "../navigation.native";

/** Lists the tools of a single category, drilling into the selected tool. */
export function ToolsScreen(props: ToolsScreenProps) {
  const { items } = useToolsScreenViewModel(props);

  return (
    <Box>
      <Catalog items={items} />
    </Box>
  );
}

export default ToolsScreen;
