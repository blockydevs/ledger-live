import React from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@ledgerhq/lumen-ui-react";
import { SearchInputView } from "./SearchInputView";
import { useTopBarSearch } from "./useTopBarSearch";

export function TopBarSearch() {
  const { t } = useTranslation();
  const { value, open, setOpen, onChange, onKeyDown } = useTopBarSearch();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SearchInputView
            value={value}
            placeholder={t("topBar.searchPlaceholder")}
            onChange={onChange}
            onKeyDown={onKeyDown}
            testId="topbar-search-input"
          />
        }
      />
      <PopoverContent align="start" width="fit" className="w-(--anchor-width) flex flex-col gap-12">
        <span className="body-2 text-muted" data-testid="topbar-search-popover">
          {t("topBar.searchEmptyState")}
        </span>
      </PopoverContent>
    </Popover>
  );
}
