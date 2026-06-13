import React, {
  ChangeEvent,
  ComponentPropsWithoutRef,
  KeyboardEvent,
  SyntheticEvent,
  forwardRef,
} from "react";
import { SearchInput } from "@ledgerhq/lumen-ui-react";
import { cn } from "LLD/utils/cn";

type SearchInputViewProps = {
  value: string;
  placeholder: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  testId?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "onChange" | "onKeyDown">;

function stopClearButtonFromTogglingOverlay(e: SyntheticEvent) {
  if (e.target instanceof Element && e.target.closest("button")) {
    e.stopPropagation();
  }
}

export const SearchInputView = forwardRef<HTMLDivElement, SearchInputViewProps>(
  function SearchInputView(
    { value, placeholder, onChange, onKeyDown, testId, className, ...rest },
    ref,
  ) {
    return (
      <div ref={ref} className={cn("min-w-0 max-w-[450px] flex-auto mr-24", className)} {...rest}>
        <div
          onClick={stopClearButtonFromTogglingOverlay}
          onPointerDown={stopClearButtonFromTogglingOverlay}
        >
          <SearchInput
            appearance="transparent"
            value={value}
            placeholder={placeholder}
            onChange={onChange}
            onKeyDown={onKeyDown}
            data-testid={testId}
          />
        </div>
      </div>
    );
  },
);
