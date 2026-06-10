import { CAROUSEL_SLIDE_TEXT_LINE_LIMITS } from "../carouselTextLineLimits";

describe("CAROUSEL_SLIDE_TEXT_LINE_LIMITS", () => {
  it("should allow two lines for the title and three lines for the subtitle", () => {
    expect(CAROUSEL_SLIDE_TEXT_LINE_LIMITS).toEqual({
      title: 2,
      subtitle: 3,
    });
  });
});
