import { expect } from "@playwright/test";
import { readFile } from "fs/promises";
import { test } from "tests/fixtures/common";
import { getModularSelector } from "tests/utils/modularSelectorUtils";
import { buildTags } from "tests/utils/tagsUtils";
import { FF_NEW_SEND_FLOW_DISABLED } from "tests/utils/featureFlagUtils";
import { Team } from "@ledgerhq/live-e2e-shared/enum/Team";
import { Account } from "@ledgerhq/live-e2e-shared/enum/Account";
import { Currency } from "@ledgerhq/live-e2e-shared/enum/Currency";
import { DeviceLabels } from "@ledgerhq/live-e2e-shared/enum/DeviceLabels";
import { Transaction } from "@ledgerhq/live-e2e-shared/models/Transaction";
import { pressUntilTextFound, waitFor } from "@ledgerhq/live-e2e-shared/speculos";
import { isTouchDevice } from "@ledgerhq/live-e2e-shared/speculosAppVersion";
import { withDeviceController } from "@ledgerhq/live-e2e-shared/deviceInteraction/DeviceController";
import { pressAndRelease } from "@ledgerhq/live-e2e-shared/deviceInteraction/TouchDeviceSimulator";

// Hedera pins every account to key index 0 (see libs/live-signer-hedera/README.md), so the
// legacy and DMK signers are expected to derive the same public key from the same seed. If
// they ever diverge, a stored account's identity changes and its funds disappear from view.
let referenceHederaPublicKey: string | undefined;

const rejectHederaSend = withDeviceController(({ getButtonsController }) => async () => {
  const buttons = getButtonsController();
  if (isTouchDevice()) {
    await pressUntilTextFound(DeviceLabels.HOLD_TO_SIGN);
    await pressAndRelease(DeviceLabels.REJECT);
    await waitFor(DeviceLabels.YES_REJECT);
    await pressAndRelease(DeviceLabels.YES_REJECT);
  } else {
    await pressUntilTextFound(DeviceLabels.REJECT);
    await buttons.both();
  }
});

type UserdataFile = {
  data?: { accounts?: { data?: { currencyId?: string; seedIdentifier?: string } }[] };
};

async function readHederaPublicKey(userdataFile: string, timeoutMs = 60000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const raw: UserdataFile = JSON.parse(await readFile(userdataFile, "utf-8"));
      const accounts = raw?.data?.accounts;
      const hederaAccount = accounts?.find(entry => entry?.data?.currencyId === Currency.HBAR.id);
      if (hederaAccount?.data?.seedIdentifier) {
        return hederaAccount.data.seedIdentifier;
      }
    } catch (e) {
      lastError = e;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(
    `Hedera account seedIdentifier not found in app.json within ${timeoutMs}ms. ${lastError}`,
  );
}

function runHederaSignerParityTest() {
  test(
    "public key, signed send and device rejection are consistent",
    { tag: buildTags({ currencyId: Currency.HBAR.id, skipLNS: true, extraTags: ["@smoke"] }) },
    async ({ app, page, userdataFile }) => {
      await test.step("account public key is derived by the real device signer", async () => {
        await app.portfolio.waitForPortfolioEmptyState();
        await app.portfolio.clickAddAccountButton();

        const selector = await getModularSelector(app, "ASSET");
        if (!selector) {
          throw new Error("Expected modular selector for the Hedera add-account flow");
        }
        await selector.validateItems();
        await selector.selectAssetByTicker(Currency.HBAR);
        await selector.selectNetwork(Currency.HBAR);
        await app.scanAccountsDrawer.selectFirstAccount();
        await app.scanAccountsDrawer.clickCloseButton();

        await app.portfolio.expectAccountsPersistedInAppJson(userdataFile, 1, 60000);

        const publicKey = await readHederaPublicKey(userdataFile);
        expect(publicKey).toMatch(/^[0-9a-f]{64}$/);

        // Both blocks run the same comparison: whichever signer path runs first records the
        // reference key, the other asserts it derived the identical key. This relies on
        // `test.describe.configure({ mode: "serial" })` below to run both blocks in one
        // worker in declaration order, so the explicit check guards against a refactor that
        // drops that guarantee and would otherwise compare `undefined` with `undefined`.
        if (referenceHederaPublicKey === undefined) {
          referenceHederaPublicKey = publicKey;
        } else {
          expect(referenceHederaPublicKey).toBeDefined();
          expect(publicKey).toBe(referenceHederaPublicKey);
        }
      });

      await test.step("an HBAR send is signed and broadcast", async () => {
        const sendTx = new Transaction(
          Account.HEDERA_1,
          Account.HEDERA_2,
          "0.01",
          undefined,
          "noTag",
        );

        await app.mainNavigation.openTargetFromMainNavigation("accounts");
        await app.accounts.navigateToAccountByName(Account.HEDERA_1.accountName);
        await app.account.clickSend();
        await app.send.craftTx(sendTx);
        await app.send.continueAmountModal();
        await app.send.expectTxInfoValidity(sendTx);
        await app.send.clickContinueToDevice();

        await app.speculos.signSendTransaction(sendTx);
        await app.send.expectTxSent();
        await app.account.navigateToViewDetails();
        await app.sendDrawer.addressValueIsVisible(sendTx.accountToCredit.address);
        await app.drawer.closeDrawer();
      });

      await test.step("a device rejection shows the same error title", async () => {
        const rejectTx = new Transaction(
          Account.HEDERA_1,
          Account.HEDERA_2,
          "0.005",
          undefined,
          "noTag",
        );

        await app.account.clickSend();
        await app.send.craftTx(rejectTx);
        await app.send.continueAmountModal();
        await app.send.expectTxInfoValidity(rejectTx);
        await app.send.clickContinueToDevice();

        await rejectHederaSend();

        await expect(page.locator("#error-TransactionRefusedOnDevice")).toContainText(
          "Operation denied on device",
        );
      });
    },
  );
}

// The two blocks below compare a public key derived in one against the other, so they must
// run in the same worker, in order.
test.describe.configure({ mode: "serial" });

test.describe("Hedera signer parity - legacy signer", () => {
  test.use({
    teamOwner: Team.BST,
    userdata: "skip-onboarding-with-last-seen-device",
    speculosApp: Currency.HBAR.speculosApp,
    featureFlags: {
      ...FF_NEW_SEND_FLOW_DISABLED,
      ldmkTransport: { enabled: true },
      ldmkHederaSigner: { enabled: false },
    },
  });

  runHederaSignerParityTest();
});

test.describe("Hedera signer parity - DMK signer", () => {
  test.use({
    teamOwner: Team.BST,
    userdata: "skip-onboarding-with-last-seen-device",
    speculosApp: Currency.HBAR.speculosApp,
    featureFlags: {
      ...FF_NEW_SEND_FLOW_DISABLED,
      ldmkTransport: { enabled: true },
      ldmkHederaSigner: { enabled: true },
    },
  });

  runHederaSignerParityTest();
});
