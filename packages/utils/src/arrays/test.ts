import { describe, expect, it } from "vitest";
import { chunk, groupBy, sumBy } from "../arrays.ts";

describe("arrays", () => {
  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunk([1], 0)).toThrow();
  });
  it("groups", () => {
    const grouped = groupBy(
      [
        { k: "a", v: 1 },
        { k: "b", v: 2 },
        { k: "a", v: 3 },
      ],
      (x) => x.k,
    );
    expect(grouped.get("a")).toHaveLength(2);
  });
  it("sums bigint", () => {
    expect(sumBy([{ v: 1n }, { v: 2n }], (x) => x.v)).toBe(3n);
  });
});
