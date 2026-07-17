import { describe, expect, it } from "vitest";
import { sampleWithoutReplacement } from "./random";

describe("random sampling", () => {
  it("returns a unique bounded sample without mutating the source", () => {
    const source = [1, 2, 3, 4];
    const result = sampleWithoutReplacement(source, 3, () => 0);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect(source).toEqual([1, 2, 3, 4]);
  });

  it("clamps invalid sample sizes", () => {
    expect(sampleWithoutReplacement([1, 2], -1)).toEqual([]);
    expect(sampleWithoutReplacement([1, 2], 10)).toHaveLength(2);
  });
});
