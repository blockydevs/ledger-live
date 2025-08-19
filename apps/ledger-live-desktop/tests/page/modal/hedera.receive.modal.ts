import { expect } from "@playwright/test";
import { Modal } from "../../component/modal.component";
import { step } from "tests/misc/reporters/step";

export class HederaReceiveWithAssociationModal extends Modal {
  readonly alertTriggerAssociation = this.page.getByTestId("trigger-association-alert");
  readonly warningAssociationRequired = this.page.getByTestId("association-required-warning");
  private selectTokenDropdown = this.page.getByText("Choose a crypto asset");
  private selectTokenSearchInput = this.page.locator('[placeholder="Search"]');

  @step("Trigger association flow")
  async triggerAssociationFlow() {
    await this.alertTriggerAssociation.getByText("click here").click();
  }

  @step("Select token")
  async selectToken(name: string) {
    await this.selectTokenDropdown.click();
    await this.selectTokenSearchInput.fill(name);
    await this.selectTokenSearchInput.press("Enter");
  }

  @step("Check association required warning visibility")
  async checkAssociationRequiredWarningVisibility(expectedState: "visible" | "hidden") {
    await this.warningAssociationRequired.waitFor({ state: expectedState });
  }

  @step("Check trigger association alert visibility")
  async checkTriggerAssociationAlertVisibility(expectedState: "visible" | "hidden") {
    await this.alertTriggerAssociation.waitFor({ state: expectedState });
  }

  @step("Check continue button is enabled")
  async checkContinueButtonEnable() {
    await expect(this.continueButton).toBeEnabled();
  }
}
