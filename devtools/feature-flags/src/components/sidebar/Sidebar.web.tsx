import { Switch } from "@ledgerhq/lumen-ui-react";
import { DarkenScreen } from "./DarkenScreen";
import type { FeatureId, Features } from "@shared/feature-flags";
import { FlagDisplayState } from "../..";

export interface SidebarProps {
  readonly setOverride: <T extends FeatureId>(key: T, value: Features[T] | undefined) => void;
  readonly display: FlagDisplayState;
  readonly onClose?: () => void;
}

export function Sidebar({ setOverride, display, onClose }: SidebarProps) {
  const { id, resolved } = display;
  return (
    <div>
      <DarkenScreen onClick={onClose} />
      <div className="w-[45vw] h-full bg-canvas p-16 absolute right-0 top-0 border-l border-muted-subtle-transparent z-51">
        <Switch
          selected={resolved.enabled}
          onChange={selected => setOverride(id, { ...resolved, enabled: selected })}
        />
      </div>
    </div>
  );
}
