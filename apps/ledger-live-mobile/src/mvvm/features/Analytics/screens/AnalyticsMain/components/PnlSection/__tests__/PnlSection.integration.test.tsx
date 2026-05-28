import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { genAccount } from "@ledgerhq/live-common/mock/account";
import { render, screen, withFlagOverrides } from "@tests/test-renderer";
import { State } from "~/reducers/types";
import { PnlDetailDrawer } from "LLM/features/Pnl/components/PnlDetailDrawer";
import PnlSection, { PNL_SECTION_TEST_IDS } from "..";

const btcAccount = genAccount("btc-1", {
  currency: getCryptoCurrencyById("bitcoin"),
  operationsSize: 0,
});

const withAccounts = (state: State): State => ({
  ...state,
  accounts: { ...state.accounts, active: [btcAccount] },
});

const compose =
  (...transforms: Array<(state: State) => State>) =>
  (state: State): State =>
    transforms.reduce((acc, t) => t(acc), state);

const withPnl = (enabled: boolean) =>
  compose(
    withAccounts,
    withFlagOverrides({ lwmWallet40: { enabled: true, params: { pnl: enabled } } }),
  );

const OPEN_BUTTON_TEST_ID = "open-drawer-button";

type Variant = "pnl" | "costBasis";

function DrawerOpener({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable testID={OPEN_BUTTON_TEST_ID} onPress={() => setOpen(true)}>
        <Text>Open</Text>
      </Pressable>
      {open ? (
        variant === "pnl" ? (
          <PnlDetailDrawer
            isOpen
            onClose={() => setOpen(false)}
            title="Portfolio profit and loss"
            description="Your portfolio performance broken down into estimated and realised returns."
            items={[
              {
                title: "Estimated return",
                value: "+ $243.32",
                definition: "The estimated profit or loss if sold at current price.",
              },
            ]}
            footer="This data is provided for informational purposes only and is not financial advice. Not to be used for tax purposes."
          />
        ) : (
          <PnlDetailDrawer
            isOpen
            onClose={() => setOpen(false)}
            title="Cost basis"
            bodyText="The total amount you paid to acquire your current holdings, including fees."
          />
        )
      ) : null}
    </>
  );
}

describe("PnlSection integration", () => {
  describe("feature flag gating", () => {
    it("renders both PnL cards when shouldDisplayPnl is true and there are accounts", () => {
      render(<PnlSection />, { overrideInitialState: withPnl(true) });

      expect(screen.getByTestId(PNL_SECTION_TEST_IDS.root)).toBeVisible();
      expect(screen.getByTestId(PNL_SECTION_TEST_IDS.unrealisedCard)).toBeVisible();
      expect(screen.getByTestId(PNL_SECTION_TEST_IDS.costBasisCard)).toBeVisible();
    });

    it("renders nothing when shouldDisplayPnl is false", () => {
      render(<PnlSection />, { overrideInitialState: withPnl(false) });

      expect(screen.queryByTestId(PNL_SECTION_TEST_IDS.root)).toBeNull();
    });

    it("renders nothing when there are no accounts", () => {
      render(<PnlSection />, {
        overrideInitialState: withFlagOverrides({
          lwmWallet40: { enabled: true, params: { pnl: true } },
        }),
      });

      expect(screen.queryByTestId(PNL_SECTION_TEST_IDS.root)).toBeNull();
    });
  });

  describe("drawer opening", () => {
    it("renders the PnL detail drawer with header, items and disclaimer when its open button is pressed", async () => {
      const { user } = render(<DrawerOpener variant="pnl" />);

      expect(screen.queryByText("Portfolio profit and loss")).toBeNull();

      await user.press(screen.getByTestId(OPEN_BUTTON_TEST_ID));

      expect(screen.getByText("Portfolio profit and loss")).toBeVisible();
      expect(
        screen.getByText(
          "Your portfolio performance broken down into estimated and realised returns.",
        ),
      ).toBeVisible();
      expect(screen.getByText("Estimated return")).toBeVisible();
      expect(
        screen.getByText(
          "This data is provided for informational purposes only and is not financial advice. Not to be used for tax purposes.",
        ),
      ).toBeVisible();
    });

    it("renders the cost basis drawer when its open button is pressed", async () => {
      const { user } = render(<DrawerOpener variant="costBasis" />);
      const body = "The total amount you paid to acquire your current holdings, including fees.";

      expect(screen.queryByText(body)).toBeNull();

      await user.press(screen.getByTestId(OPEN_BUTTON_TEST_ID));

      expect(screen.getByText("Cost basis")).toBeVisible();
      expect(screen.getByText(body)).toBeVisible();
    });
  });
});
