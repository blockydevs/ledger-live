import { buildPrompt } from "../buildPrompt";
import {
  GenericAwarenessModalLayout,
  type GenericAwarenessModalBrazeCard,
  type GenericAwarenessModalInputExtras,
} from "../types";

const makeCard = (
  id: string,
  extras: GenericAwarenessModalInputExtras,
): GenericAwarenessModalBrazeCard => ({
  id,
  extras,
});

describe("buildPrompt", () => {
  it("should build prompt content from a valid prompt input", () => {
    const promptCard = makeCard("prompt", {
      layout: GenericAwarenessModalLayout.Prompt,
      campaignId: "campaign-1",
      title: "Prompt title",
      subtitle: "Prompt subtitle",
      imageUrl: "https://example.com/prompt.png",
      primaryButtonLabel: "Learn more",
      primaryButtonLink: "https://example.com",
    });

    const prompt = buildPrompt("campaign-1", [promptCard]);

    expect(prompt).toEqual({
      layout: GenericAwarenessModalLayout.Prompt,
      id: "campaign-1",
      title: "Prompt title",
      subtitle: "Prompt subtitle",
      imageUrl: "https://example.com/prompt.png",
      primaryButtonLabel: "Learn more",
      primaryButtonLink: "https://example.com",
    });
  });

  it("should default missing prompt fields to empty strings", () => {
    const promptCard = makeCard("prompt", {
      layout: GenericAwarenessModalLayout.Prompt,
      campaignId: "campaign-1",
    });

    const prompt = buildPrompt("campaign-1", [promptCard]);

    expect(prompt).toEqual({
      layout: GenericAwarenessModalLayout.Prompt,
      id: "campaign-1",
      title: "",
      subtitle: "",
      imageUrl: "",
      primaryButtonLabel: "",
      primaryButtonLink: "",
    });
  });

  it("should return undefined when there is no valid prompt input", () => {
    const carouselCard = makeCard("carousel", {
      layout: GenericAwarenessModalLayout.Carousel,
      campaignId: "campaign-1",
      index: "0",
      title: "Ignored",
    });

    const prompt = buildPrompt("campaign-1", [carouselCard]);

    expect(prompt).toBeUndefined();
  });
});
