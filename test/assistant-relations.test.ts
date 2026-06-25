import { describe, it, expect } from "vitest";
import { classifyEffects, isBlocked, formatEffectGroups } from "@/lib/assistant/relations";

describe("classifyEffects", () => {
  it("buckets restrict / cascade / setNull and drops zero counts", () => {
    const e = classifyEffects([
      { label: "Brix readings", kind: "restrict", count: 23 },
      { label: "harvest records", kind: "restrict", count: 0 }, // dropped
      { label: "blocks", kind: "cascade", count: 5 },
      { label: "varieties", kind: "setNull", count: 3 },
    ]);
    expect(e.blocked).toEqual([{ label: "Brix readings", count: 23 }]);
    expect(e.cascade).toEqual([{ label: "blocks", count: 5 }]);
    expect(e.setNull).toEqual([{ label: "varieties", count: 3 }]);
  });

  it("isBlocked is true only when a restrict child exists", () => {
    expect(isBlocked(classifyEffects([{ label: "Brix readings", kind: "restrict", count: 1 }]))).toBe(true);
    expect(isBlocked(classifyEffects([{ label: "blocks", kind: "cascade", count: 9 }]))).toBe(false);
    expect(isBlocked(classifyEffects([]))).toBe(false);
  });

  it("formats effect groups as human phrases", () => {
    expect(formatEffectGroups([{ label: "Brix readings", count: 23 }, { label: "harvest records", count: 6 }])).toBe(
      "23 Brix readings, 6 harvest records",
    );
  });
});
