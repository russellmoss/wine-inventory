import { describe, it, expect } from "vitest";
import { decideRackRoute } from "@/lib/vessels/rack-core";

describe("decideRackRoute (Unit 8b — rack becomes blend-aware)", () => {
  it("empty destination → plain RACK (no lineage)", () => {
    expect(decideRackRoute(["A"], [])).toBe("RACK");
  });

  it("destination holds the SAME lot → RACK (merge, not a blend)", () => {
    expect(decideRackRoute(["A"], ["A"])).toBe("RACK");
  });

  it("destination holds a DIFFERENT lot → BLEND (grow-existing)", () => {
    expect(decideRackRoute(["A"], ["B"])).toBe("BLEND");
  });

  it("mixed source where any lot differs from the resident → BLEND", () => {
    expect(decideRackRoute(["A", "B"], ["B"])).toBe("BLEND");
  });

  it("source identical to a single-resident destination → RACK (pure merge)", () => {
    expect(decideRackRoute(["B"], ["B"])).toBe("RACK");
  });

  it("legacy multi-resident destination → RACK (don't guess a child)", () => {
    expect(decideRackRoute(["A"], ["B", "C"])).toBe("RACK");
  });
});
