import { Fragment } from "react";
import type { FeatureId } from "@shared/feature-flags";
import type { FeatureFlagsToolProps } from "../../types";
import { FlagRow } from "../flagRow/FlagRow.web";
import { ALL_FLAG_IDS } from "../../constants";
import { FlagListHeader } from "../flagListHeader/FlagListHeader";
import { useFeatureFlagsState } from "../../hooks/useFeatureFlagsState";
import { useFlagSelection } from "../../hooks/useFlagSelection";
import { Divider } from "@ledgerhq/lumen-ui-react";
import { Sidebar } from "../sidebar/Sidebar";
import { ToolsHeader } from "../toolsHeader/ToolsHeader";
import { useFeatureFlagsFilters } from "../../hooks";

export const FlagList = (props: FeatureFlagsToolProps) => {
  const { overrides, setOverride } = props;
  const { getFlagDisplayState } = useFeatureFlagsState(props);
  const { selectedFlagId, selectFlag, clearSelection } = useFlagSelection();
  const featureIds: FeatureId[] = ALL_FLAG_IDS;
  const { filteredFlagIds, setSearch, search, filter, setFilter, counts } =
    useFeatureFlagsFilters(props);

  return (
    <div>
      <div className="sticky top-0 z-10 bg-canvas">
        <ToolsHeader
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          counts={counts}
        />
        <Divider />
        <FlagListHeader
          overrideCount={Object.keys(overrides).length}
          numberOfFlags={featureIds.length}
          numberOfFilteredFlags={filteredFlagIds.length}
        />
        <Divider className="bg-canvas-muted" />
      </div>
      {selectedFlagId && (
        <Sidebar
          setOverride={setOverride}
          display={getFlagDisplayState(selectedFlagId)}
          onClose={clearSelection}
          clearOverride={() => setOverride(selectedFlagId, undefined)}
        />
      )}
      <div>
        {filteredFlagIds.map(featureId => (
          <Fragment key={featureId}>
            <FlagRow
              display={getFlagDisplayState(featureId)}
              setOverride={setOverride}
              onSelect={() => selectFlag(featureId)}
            />
            <Divider className="bg-canvas-muted" />
          </Fragment>
        ))}
      </div>
    </div>
  );
};
