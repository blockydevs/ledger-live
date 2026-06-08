import React from "react";
import type { FearAndGreedIndex } from "@ledgerhq/live-common/cmc-client/state-manager/types";
import { getFearAndGreedTranslationKey } from "@ledgerhq/live-common/cmc-client/utils/fearAndGreed";
import { Tile } from "@ledgerhq/lumen-ui-react";
import { useTranslation } from "react-i18next";
import { FearAndGreedIndicator } from "LLD/features/FearAndGreed/components/FearAndGreedIndicator";
import { FearAndGreedDialog } from "LLD/features/FearAndGreed/components/FearAndGreedDialog";
import { track } from "~/renderer/analytics/segment";

export const MoodIndexCardView = ({ data }: { data: FearAndGreedIndex }) => {
  const { t } = useTranslation();

  const translationKey = getFearAndGreedTranslationKey(data.value);

  const onClick = () => {
    track("button_clicked", {
      button: "mood_index",
    });
  };

  return (
    <FearAndGreedDialog>
      <Tile
        appearance="card"
        className="w-full cursor-pointer"
        data-testid="mood-index-card"
        onClick={onClick}
      >
        <div className="flex w-full items-center justify-between gap-12">
          <div className="flex flex-col items-start gap-4 text-left">
            <span className="body-3 text-muted">{t("market.topCards.moodIndex.title")}</span>
            <span className="body-2-semi-bold text-base">{t(translationKey)}</span>
          </div>
          <FearAndGreedIndicator value={data.value} />
        </div>
      </Tile>
    </FearAndGreedDialog>
  );
};
