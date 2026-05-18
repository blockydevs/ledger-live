import { Step } from "jest-allure2-reporter/api";

const VALIDATOR_ROW_REGEX = /^evm-validator-row-.+$/;
const FEE_ESTIMATION_TIMEOUT = 120000;

export default class EvmStakePage {
  startStakingCtaId = "account-quick-action-button-cta";
  addDelegationCtaId = "account-quick-action-button-addDelegation";
  amountInputId = "evm-delegation-amount-input";
  useMaxButtonId = "evm-delegation-use-max";
  amountContinueButtonId = "enabled-evm-delegation-amount-continue";
  delegationSummaryLabel = "Delegated assets";

  @Step("Start EVM delegation flow from account quick actions")
  async startDelegate() {
    await waitForElementById(this.startStakingCtaId);
    await tapById(this.startStakingCtaId);
  }

  @Step("Tap on Add delegation CTA")
  async tapAddDelegation() {
    await waitForElementById(this.addDelegationCtaId);
    await tapById(this.addDelegationCtaId);
  }

  @Step("Wait for the validator list to be visible")
  async waitForValidatorListVisible() {
    await waitForElement(getElementById(VALIDATOR_ROW_REGEX));
  }

  @Step("Select the first validator displayed in the list")
  async selectFirstValidator(): Promise<string> {
    await this.waitForValidatorListVisible();
    const firstValidatorRowId = await getIdByRegexp(VALIDATOR_ROW_REGEX);
    await tapById(firstValidatorRowId);
    await waitForElementById(this.amountInputId);
    return firstValidatorRowId;
  }

  @Step("Set delegation amount to {amount}")
  async setAmount(amount: string) {
    await waitForElementById(this.amountInputId);
    await typeTextById(this.amountInputId, amount);
  }

  @Step("Wait until network fees are loaded and continue is enabled")
  async waitForAmountContinueEnabled(timeout = FEE_ESTIMATION_TIMEOUT) {
    await waitForElementById(this.amountContinueButtonId, timeout);
  }

  @Step("Tap use max amount button")
  async useMaxAmount() {
    await waitForElementById(this.useMaxButtonId);
    await tapById(this.useMaxButtonId);
    await this.waitForAmountContinueEnabled();
  }

  @Step("Continue from amount screen")
  async continueAmount() {
    await waitForElementById(this.amountContinueButtonId);
    await tapById(this.amountContinueButtonId);
  }

  @Step("Set amount and continue once fees are ready")
  async setAmountAndContinue(amount: string) {
    await this.setAmount(amount);
    await this.waitForAmountContinueEnabled();
    await this.continueAmount();
  }

  @Step("Expect delegated assets summary to be visible on the account page")
  async expectDelegatedAssetsVisible() {
    await waitForElementByText(this.delegationSummaryLabel);
    await detoxExpect(getElementByText(this.delegationSummaryLabel)).toBeVisible();
  }

  @Step("Expect Add delegation CTA to be visible on the account page")
  async expectAddDelegationCtaVisible() {
    await waitForElementById(this.addDelegationCtaId);
    await detoxExpect(getElementById(this.addDelegationCtaId)).toBeVisible();
  }
}
