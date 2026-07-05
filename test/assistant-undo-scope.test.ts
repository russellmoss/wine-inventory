import { describe, it, expect } from "vitest";
import { opTypeFilter } from "@/lib/assistant/scope";

// Regression for the live-QA bug (2026-07-05): "undo the last addition on T3" reversed the CRUSH.
// Two defects: (1) the resolver keyed on volumetric `lines`, so neutral ADDITION ops (which attach via
// `treatments`) were invisible and it grabbed the crush (fixed in resolveRecentOperation — DB-level);
// (2) it never scoped by the op TYPE the user named. opTypeFilter is that hard guard: "addition" must
// map to ADDITION only, so undo can never resolve to a crush/press/blend when the user said "addition".

describe("opTypeFilter — undo type scoping", () => {
  it('"addition" scopes to ADDITION only (never a crush)', () => {
    expect(opTypeFilter("addition")).toEqual(["ADDITION"]);
    expect(opTypeFilter("Addition")).toEqual(["ADDITION"]);
    expect(opTypeFilter("addition")).not.toContain("CRUSH");
  });

  it("maps the common op words to their ledger types", () => {
    expect(opTypeFilter("fining")).toEqual(["FINING"]);
    expect(opTypeFilter("crush")).toEqual(["CRUSH"]);
    expect(opTypeFilter("press")).toEqual(["PRESS"]);
    expect(opTypeFilter("blend")).toEqual(["BLEND"]);
    expect(opTypeFilter("rack")).toEqual(["RACK"]);
    expect(opTypeFilter("bottling")).toEqual(["BOTTLE"]);
    expect(opTypeFilter("topping")).toEqual(["TOPPING"]);
    expect(opTypeFilter("filter")).toEqual(["FILTRATION"]);
  });

  it('"dose" spans both additions and finings', () => {
    expect(opTypeFilter("dose")).toEqual(["ADDITION", "FINING"]);
  });

  it("absent/unknown → undefined (no filter, falls back to most-recent)", () => {
    expect(opTypeFilter()).toBeUndefined();
    expect(opTypeFilter("")).toBeUndefined();
    expect(opTypeFilter("wobble")).toBeUndefined();
  });
});
