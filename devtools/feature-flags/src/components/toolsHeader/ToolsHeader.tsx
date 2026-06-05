import {
  SearchInput,
  SegmentedControl,
  SegmentedControlButton,
  Button,
  InteractiveIcon,
  Menu,
  MenuTrigger,
  IconButton,
  MenuContent,
  MenuItem,
} from "@ledgerhq/lumen-ui-react";
import { FILTERS } from "../../hooks/useFeatureFlagsFilters";
import type { FlagFilter } from "../../types";
import { Pill } from "../pill/Pill.web";
import { FilterSort, ArrowUp, ArrowDown, MoreHorizontal } from "@ledgerhq/lumen-ui-react/symbols";
import type { SortCategory, SortDirection } from "../../hooks/useSortFlag";

const FILTER_LABELS: Record<FlagFilter, string> = {
  all: "All",
  enabled: "On",
  disabled: "Off",
  overridden: "Overridden",
};

const SORT_CATEGORY_LABELS: Record<SortCategory, (direction: SortDirection) => string> = {
  name: direction => (direction === "asc" ? "A→Z" : "Z→A"),
  overridden: () => "Overridden first",
  enabled: () => "Enabled first",
};

export interface ToolsHeaderProps {
  search: string;
  setSearch: (value: string) => void;
  filter: FlagFilter;
  setFilter: (filter: string) => void;
  counts: Record<FlagFilter, number>;
  sortCategory: SortCategory;
  sortDirection: SortDirection;
  cycleCategory: () => void;
  toggleDirection: () => void;
  clearAllOverrides: () => void;
  exportOverrides: () => void;
  importOverrides: () => void;
}

export function ToolsHeader({
  search,
  setSearch,
  filter,
  setFilter,
  counts,
  sortCategory,
  sortDirection,
  cycleCategory,
  toggleDirection,
  clearAllOverrides,
  exportOverrides,
  importOverrides,
}: ToolsHeaderProps) {
  return (
    // Responsive layout (viewport-based, matching the rest of the panel):
    // - lg+   : single row (search · filter · actions)
    // - sm-lg : filter bar drops to its own row beneath search + actions
    // - <sm   : everything stacks vertically
    <div className="flex flex-col gap-16 p-16 lg:h-80 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-16 sm:flex-row sm:items-center sm:justify-between lg:contents">
        <SearchInput
          className="lg:order-1"
          placeholder="Search flags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-4 lg:order-3">
          <Button appearance="no-background" size="sm" icon={FilterSort} onClick={cycleCategory}>
            {SORT_CATEGORY_LABELS[sortCategory](sortDirection)}
          </Button>
          <InteractiveIcon
            iconType="stroked"
            icon={sortDirection === "asc" ? ArrowUp : ArrowDown}
            size={32}
            aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
            onClick={toggleDirection}
          />
          <Menu>
            <MenuTrigger>
              <IconButton aria-label="Actions" size="sm" appearance="gray" icon={MoreHorizontal} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onClick={exportOverrides}>Export flags</MenuItem>
              <MenuItem onClick={importOverrides}>Import flags</MenuItem>
              <MenuItem onClick={clearAllOverrides}>Reset all overrides</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <SegmentedControl
        className="self-start lg:order-2 lg:self-center"
        selectedValue={filter}
        onSelectedChange={value => setFilter(value)}
        tabLayout="fit"
      >
        {FILTERS.map(f => (
          <SegmentedControlButton key={f} value={f} className="flex items-center gap-4">
            <div className={"flex items-center gap-4 hover:text-muted-hover"}>
              {FILTER_LABELS[f]}
              <Pill variant={filter === f ? "black" : "muted"}>{counts[f]}</Pill>
            </div>
          </SegmentedControlButton>
        ))}
      </SegmentedControl>
      <div className="flex items-center gap-4">
        <Button appearance="no-background" size="sm" icon={FilterSort} onClick={cycleCategory}>
          {SORT_CATEGORY_LABELS[sortCategory](sortDirection)}
        </Button>
        <InteractiveIcon
          iconType="stroked"
          icon={sortDirection === "asc" ? ArrowUp : ArrowDown}
          size={32}
          aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
          onClick={toggleDirection}
        />
      </div>
      <Menu>
        <MenuTrigger>
          <IconButton aria-label="Actions" size="sm" appearance="gray" icon={MoreHorizontal} />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onClick={exportOverrides}>Export flags</MenuItem>
          <MenuItem onClick={importOverrides}>Import flags</MenuItem>
          <MenuItem onClick={clearAllOverrides}>Reset all overrides</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
