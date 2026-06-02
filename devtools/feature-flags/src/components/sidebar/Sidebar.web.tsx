import { DarkenScreen } from "./DarkenScreen";
import type { FeatureId, Features } from "@shared/feature-flags";
import { FlagDisplayState } from "../..";
import { SidebarTop } from "./sidebarTop/SidebarTop";
import { Divider } from "@ledgerhq/lumen-ui-react";

export interface SidebarProps {
  readonly setOverride: <T extends FeatureId>(key: T, value: Features[T] | undefined) => void;
  readonly display: FlagDisplayState;
  readonly onClose?: () => void;
  readonly clearOverride: (key: FeatureId) => void;
}

export function Sidebar({ setOverride, display, onClose, clearOverride }: SidebarProps) {
  return (
    <div>
      <DarkenScreen onClick={onClose} />
      <div className="w-[45vw] h-full bg-canvas absolute right-0 top-0 border-l border-muted-subtle-transparent z-51">
        <SidebarTop
          display={display}
          setOverride={setOverride}
          onClose={onClose}
          clearOverride={clearOverride}
        />
        <Divider />
      </div>
    </div>
  );
}
