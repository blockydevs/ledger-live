import * as guard from "./guards";

describe("guards", () => {
  describe("isDefined", () => {
    it.each([0, "", false, Number.NaN, [], {}])("returns true for %p", value => {
      expect(guard.isDefined(value)).toBe(true);
    });

    it.each([null, undefined])("returns false for %p", value => {
      expect(guard.isDefined(value)).toBe(false);
    });

    it("narrows arrays when used in filter", () => {
      const values: Array<number | null | undefined> = [1, null, 0, undefined];
      const result: number[] = values.filter(guard.isDefined);
      expect(result).toEqual([1, 0]);
    });
  });

  describe("isObject", () => {
    it.each([{}, { a: 1 }, new Date()])("returns true for %p", value => {
      expect(guard.isObject(value)).toBe(true);
    });

    it.each([null, undefined, [], "x", 1])("returns false for %p", value => {
      expect(guard.isObject(value)).toBe(false);
    });
  });
});
