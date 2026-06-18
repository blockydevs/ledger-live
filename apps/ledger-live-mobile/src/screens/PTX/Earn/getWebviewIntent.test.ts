import { getIntentFlowState, getWebviewIntent } from "./getWebviewIntent";

describe("getWebviewIntent", () => {
  it("reads intent from the query string", () => {
    expect(getWebviewIntent("https://earn.test/v2/ios/deposit?intent=deposit&uiVersion=v4")).toBe(
      "deposit",
    );
    expect(getWebviewIntent("https://earn.test/v2/ios/earn-simulator?intent=simulate")).toBe(
      "simulate",
    );
  });

  it("infers intent from the pathname when the query param is absent", () => {
    expect(getWebviewIntent("https://earn.test/v2/android/deposit")).toBe("deposit");
    expect(getWebviewIntent("https://earn.test/v2/ios/earn-simulator")).toBe("simulate");
  });

  it("returns undefined for dashboard routes", () => {
    expect(getWebviewIntent("https://earn.test/v2/ios/homescreen")).toBeUndefined();
  });
});

describe("getIntentFlowState", () => {
  it("returns true for intent flow routes", () => {
    expect(getIntentFlowState("https://earn.test/v2/android/deposit?intent=deposit")).toBe(true);
  });

  it("returns false for the dashboard", () => {
    expect(getIntentFlowState("https://earn.test/v2/android/homescreen")).toBe(false);
  });

  it("returns null for unknown URLs", () => {
    expect(getIntentFlowState(undefined)).toBeNull();
    expect(getIntentFlowState("about:blank")).toBeNull();
  });
});
