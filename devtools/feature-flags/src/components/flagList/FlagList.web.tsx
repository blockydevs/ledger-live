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

export const FlagList = (props: FeatureFlagsToolProps) => {
  const { overrides, setOverride } = props;
  const { getFlagDisplayState } = useFeatureFlagsState(props);
  const { selectedFlagId, selectFlag, clearSelection } = useFlagSelection();
  const featureIds: FeatureId[] = ALL_FLAG_IDS;

  return (
    <>
      <FlagListHeader
        overrideCount={Object.keys(overrides).length}
        numberOfFlags={featureIds.length}
        numberOfFilteredFlags={featureIds.length} // no filter implemented yet
      />
      <Divider className="bg-canvas-muted" />
      {selectedFlagId && (
        <Sidebar
          setOverride={setOverride}
          display={getFlagDisplayState(selectedFlagId)}
          onClose={clearSelection}
        />
      )}
      <div>
        {featureIds.map(featureId => (
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
    </>
  );
};
