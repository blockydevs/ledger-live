import { expect } from "@playwright/test";
import { Mnemonic } from "@hashgraph/sdk";
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

// Hedera pins every account to key index 0 (see libs/live-signer-hedera/README.md), so both
// signers must derive the seed's key at index 0. If either diverges, a stored account's
// identity changes and its funds disappear from view.
async function expectedPublicKeyAtIndex0(): Promise<string> {
  const seed = process.env.SEED;
  if (!seed) {
    throw new Error("SEED is not set");
  }
  const mnemonic = await Mnemonic.fromString(seed);
  const { publicKey } = await mnemonic.toStandardEd25519PrivateKey("", 0);

  return publicKey.toStringRaw();
}

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

type HederaAccountData = { currencyId?: string; seedIdentifier?: string; freshAddress?: string };

type UserdataFile = { data?: { accounts?: { data?: HederaAccountData }[] } };

async function readHederaAccount(
  userdataFile: string,
  timeoutMs = 60000,
): Promise<HederaAccountData> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const raw: UserdataFile = JSON.parse(await readFile(userdataFile, "utf-8"));
      const accounts = raw?.data?.accounts;
      const hederaAccount = accounts?.find(entry => entry?.data?.currencyId === Currency.HBAR.id);
      if (hederaAccount?.data?.seedIdentifier) {
        return hederaAccount.data;
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

        const account = await readHederaAccount(userdataFile);

        expect(account.seedIdentifier).toBe(await expectedPublicKeyAtIndex0());
        // The send steps below drive the account by name, and Ledger Wallet names the first
        // discovered HBAR account "Hedera 1" whatever its id, so pin the id here: a seed
        // other than the one the fixtures were built from fails with the two ids side by
        // side instead of timing out later on a disabled Continue button.
        expect(account.freshAddress).toBe(Account.HEDERA_1.address);
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

        await expect(page.locator("#error-UserRefusedOnDevice")).toContainText("Action rejected");
      });
    },
  );
}

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
