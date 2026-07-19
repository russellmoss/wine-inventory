import { describe, it, expect } from "vitest";
import { rrfFuse, normalizeScores } from "@/lib/knowledge/rrf";
import { mmrSelect, _cosine } from "@/lib/knowledge/mmr";

describe("RRF fusion", () => {
  it("rewards a chunk that ranks well in BOTH arms", () => {
    const dense = ["a", "b", "c"];
    const lexical = ["b", "d", "a"];
    const fused = rrfFuse([dense, lexical]);
    // b is rank0 in lexical + rank1 in dense -> should top the fused list
    expect(fused[0].id).toBe("b");
    // a chunk found by only one arm still appears
    expect(fused.map((f) => f.id)).toContain("c");
    expect(fused.map((f) => f.id)).toContain("d");
  });

  it("normalizes fused scores into [0,1]", () => {
    const norm = normalizeScores(rrfFuse([["a", "b", "c"]]));
    const vals = [...norm.values()];
    expect(Math.max(...vals)).toBeCloseTo(1, 5);
    expect(Math.min(...vals)).toBeCloseTo(0, 5);
  });
});

describe("MMR diversity", () => {
  it("skips a near-duplicate in favor of a diverse-but-slightly-less-relevant passage", () => {
    const candidates = [
      { item: "A", relevance: 1.0, vector: [1, 0, 0] },
      { item: "B", relevance: 0.9, vector: [1, 0, 0] }, // near-identical to A
      { item: "C", relevance: 0.8, vector: [0, 1, 0] }, // orthogonal / diverse
    ];
    const picked = mmrSelect(candidates, 2, 0.7);
    expect(picked[0]).toBe("A");
    expect(picked[1]).toBe("C"); // not the redundant B
  });

  it("cosine of identical vectors is 1, orthogonal is 0", () => {
    expect(_cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(_cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
});
