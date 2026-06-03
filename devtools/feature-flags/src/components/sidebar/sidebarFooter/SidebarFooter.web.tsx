import { Button } from "@ledgerhq/lumen-ui-react";

export interface SidebarFooterProps {
  onClose: () => void;
  onApplyOverride: () => void;
  overrideDisabled: boolean;
  currentJsonFlag: string;
}

export function SidebarFooter({ onClose, onApplyOverride, overrideDisabled }: SidebarFooterProps) {
  return (
    <div className="flex justify-between items-center p-8">
      <Button appearance="no-background" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={() => onApplyOverride()} disabled={overrideDisabled}>
        Apply
      </Button>
    </div>
  );
}
