import { ChangeEvent, KeyboardEvent, useCallback, useState } from "react";

/**
 * Single source of state for the global TopBar search.
 *
 * Extension point: a debounced `value` → fetch → `results` pipeline will be wired here so the
 * popover can render search results. The return shape is kept stable for that addition.
 */
export function useTopBarSearch() {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setValue("");
      setOpen(false);
      e.currentTarget.blur();
    }
  }, []);

  return { value, open, setOpen, onChange, onKeyDown };
}
