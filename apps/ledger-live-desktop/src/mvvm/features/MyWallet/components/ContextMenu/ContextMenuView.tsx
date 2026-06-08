import React from "react";
import { Popover, PopoverContent } from "@ledgerhq/lumen-ui-react";
import BackupHub from "LLD/features/BackupHub";
import { ActionsList } from "../ActionsList";
import { MyLedger } from "../MyLedger";
import ContextMenuContext from "../ContextMenuContext";
import { ContextMenuTrigger } from "../ContextMenuTrigger";
import { MY_WALLET_TRACKING_PAGE_NAME } from "../../constants";
import TopBar from "../TopBar";
import { Explore } from "../Explore";
import { ContextMenuTransition } from "./ContextMenuTransition";
import type { ContextMenuViewProps } from "./types";
import TrackPage from "~/renderer/analytics/TrackPage";

const side = "bottom";
const align = "end";

export function ContextMenuView({ open, onOpenChange, contextValue }: ContextMenuViewProps) {
  const { view, goBack, close } = contextValue;

  return (
    <Popover overlay open={open} onOpenChange={onOpenChange}>
      <ContextMenuTrigger />

      <PopoverContent width="fixed" side={side} align={align} className="overflow-hidden">
        <ContextMenuContext.Provider value={contextValue}>
          <TrackPage category={MY_WALLET_TRACKING_PAGE_NAME} />
          <ContextMenuTransition view={view}>
            {view === "backupHub" ? (
              <BackupHub onBack={goBack} onClose={close} />
            ) : (
              <>
                <TopBar />
                <ActionsList />
                <div className="flex flex-col gap-12">
                  <MyLedger />
                  <Explore />
                </div>
              </>
            )}
          </ContextMenuTransition>
        </ContextMenuContext.Provider>
      </PopoverContent>
    </Popover>
  );
}
