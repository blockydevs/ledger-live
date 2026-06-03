import { Divider } from "@ledgerhq/lumen-ui-react";
import { cn } from "@ledgerhq/lumen-utils-shared";

export interface FlagJsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  isValidJson: boolean;
}

export function FlagJsonEditor({ value, onChange, isValidJson }: FlagJsonEditorProps) {
  return (
    <div className="bg-canvas-muted rounded-md">
      <div className="font-semibold text-lg p-8 bg-canvas">FlagJsonEditor</div>
      <Divider />
      <textarea
        className={cn(
          "block bg-canvas-muted body-3 h-full w-full font-mono rounded-md resize-none outline-none min-h-[200px] p-8",
          {
            "border-2 border-error": !isValidJson,
          },
        )}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
