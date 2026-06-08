export type ContextMenuView = "menu" | "backupHub";

export type ContextMenuProviderValue = {
  readonly close: () => void;
  readonly view: ContextMenuView;
  readonly navigateTo: (view: ContextMenuView) => void;
  readonly goBack: () => void;
};

export type ContextMenuViewProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly contextValue: ContextMenuProviderValue;
};
