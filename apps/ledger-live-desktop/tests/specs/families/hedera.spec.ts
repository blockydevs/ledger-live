import test from "../../fixtures/common";
import { Layout } from "../../component/layout.component";
import { AccountsPage } from "../../page/accounts.page";
import { HederaReceiveWithAssociationModal } from "../../page/modal/hedera.receive.modal";
import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets/lib-es/tokens";
import invariant from "invariant";

test.use({ userdata: "hedera-subAccounts" });

test("Hedera token association flow", async ({ page, app }) => {
  const layout = new Layout(page);
  const accountsPage = new AccountsPage(page);
  const receiveWithAssociationModal = new HederaReceiveWithAssociationModal(page);

  await test.step("navigate to Hedera account", async () => {
    await layout.goToAccounts();
    await accountsPage.navigateToAccountByName("Hedera 2");
  });

  await test.step("open receive modal and see association alert", async () => {
    await app.account.clickReceive();
    await receiveWithAssociationModal.waitForModalToAppear();
    await receiveWithAssociationModal.checkTriggerAssociationAlertVisibility("visible");
  });

  await test.step("trigger token association flow", async () => {
    await receiveWithAssociationModal.triggerAssociationFlow();
  });

  await test.step("select unassociated token", async () => {
    const unassociatedToken = findTokenByAddressInCurrency("0.0.2009716", "hedera");
    invariant(unassociatedToken, "No unassociated token found");

    await receiveWithAssociationModal.selectToken(unassociatedToken.name);
    await receiveWithAssociationModal.checkAssociationRequiredWarningVisibility("visible");
  });

  await test.step("continue to association confirmation", async () => {
    await receiveWithAssociationModal.continue();
  });
});

test("Hedera account with auto token association", async ({ page, app }) => {
  const layout = new Layout(page);
  const accountsPage = new AccountsPage(page);
  const receiveWithAssociationModal = new HederaReceiveWithAssociationModal(page);

  await test.step("navigate to Hedera account with auto association", async () => {
    await layout.goToAccounts();
    await accountsPage.navigateToAccountByName("Hedera 1");
  });

  await test.step("open receive modal without association alert", async () => {
    await app.account.clickReceive();
    await receiveWithAssociationModal.waitForModalToAppear();
    await receiveWithAssociationModal.checkTriggerAssociationAlertVisibility("hidden");
  });
});
