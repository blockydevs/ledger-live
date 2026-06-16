import { Dialog } from "tests/component/dialog.component";
import { expect } from "@playwright/test";
import { Swap } from "@ledgerhq/live-common/e2e/models/Swap";
import { SwapProvider } from "@ledgerhq/live-common/e2e/enum/Provider";
import { step } from "tests/misc/reporters/step";

export class SwapTransactionStatusDialog extends Dialog {
  readonly dialog = this.page.getByTestId("swap-transaction-status-dialog");
  readonly title = this.page.getByTestId("swap-status-title");
  readonly date = this.page.getByTestId("swap-status-date");
  readonly sendRow = this.page.getByTestId("swap-status-send-row");
  readonly receiveRow = this.page.getByTestId("swap-status-receive-row");
  readonly sentAmount = this.page.getByTestId("swap-status-sent-amount");
  readonly receivedAmount = this.page.getByTestId("swap-status-received-amount");
  readonly provider = this.page.getByTestId("swap-status-provider");
  readonly swapId = this.page.getByTestId("swap-status-swap-id");
  readonly networkFees = this.page.getByTestId("swap-status-network-fees");
  readonly receiveAccount = this.page.getByTestId("swap-status-receive-account");
  readonly viewExplorerBtn = this.page.getByTestId("swap-status-view-explorer-btn");

  @step("Verify swap transaction status dialog information")
  async expectSwapTransactionStatusDialogInfos(swapId: string, swap: Swap, provider: SwapProvider) {
    await expect(this.dialog).toBeVisible();
    await expect(this.title).toBeVisible();
    expect(await this.title.textContent()).toMatch(/Swap/);
    await expect(this.date).toBeVisible();
    await expect(this.sendRow).toBeVisible();
    await expect(this.sentAmount).toBeVisible();
    expect(await this.sentAmount.textContent()).toContain(swap.amount);
    await expect(this.receiveRow).toBeVisible();
    await expect(this.receivedAmount).toBeVisible();
    await expect(this.networkFees).toBeVisible();
    expect(await this.networkFees.textContent()).toBeTruthy();
    await expect(this.receiveAccount).toBeVisible();
    expect(await this.receiveAccount.textContent()).toContain(swap.accountToCredit.accountName);
    expect(await this.swapId.textContent()).toContain(swapId.slice(0, 6));
    expect(await this.provider.textContent()).toContain(provider.uiName);
    await expect(this.viewExplorerBtn).toBeVisible();
    const explorerHref = await this.viewExplorerBtn.getAttribute("data-href");
    expect(explorerHref).not.toBeNull();
    expect(explorerHref!).toMatch(/^https:\/\/explorer\.solana\.com\/tx/);
  }
}
