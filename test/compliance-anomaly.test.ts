import { describe, it, expect } from "vitest";
import { deterministicAnomalies, hasFilingBlocker } from "@/lib/compliance/anomaly";
import type { ComputedSnapshot } from "@/lib/compliance/generate";

const clean: ComputedSnapshot = {
  cells: [{ section: "A", line: 31, column: "A_LE16", sub: null, gallons: 129.44 }],
  footings: [{ section: "A", column: "A_LE16", sub: null, addSideTotal: 264.17, removeSideTotal: 264.17, foots: true }],
  balanced: true,
  a13EqualsB2: true,
  partX: [],
  perLot: [],
  needsAbvLotIds: [],
};

describe("deterministicAnomalies (Unit 11)", () => {
  it("clean report → no findings, no blocker", () => {
    const f = deterministicAnomalies({ snapshot: clean });
    expect(f).toHaveLength(0);
    expect(hasFilingBlocker(f)).toBe(false);
  });

  it("missing ABV → blocker", () => {
    const f = deterministicAnomalies({ snapshot: { ...clean, needsAbvLotIds: ["lot1", "lot2"] } });
    expect(f.some((x) => x.code === "missing-abv" && x.severity === "blocker")).toBe(true);
    expect(hasFilingBlocker(f)).toBe(true);
  });

  it("does not balance → blocker", () => {
    const f = deterministicAnomalies({
      snapshot: { ...clean, balanced: false, footings: [{ section: "A", column: "A_LE16", sub: null, addSideTotal: 100, removeSideTotal: 90, foots: false }] },
    });
    expect(f.some((x) => x.code === "does-not-balance" && x.severity === "blocker")).toBe(true);
  });

  it("A13 ≠ B2 → warning (not a blocker)", () => {
    const f = deterministicAnomalies({ snapshot: { ...clean, a13EqualsB2: false } });
    expect(f.some((x) => x.code === "a13-neq-b2" && x.severity === "warning")).toBe(true);
    expect(hasFilingBlocker(f)).toBe(false);
  });

  it("negative on-hand end → blocker", () => {
    const f = deterministicAnomalies({
      snapshot: { ...clean, cells: [{ section: "A", line: 31, column: "A_LE16", sub: null, gallons: -5 }] },
    });
    expect(f.some((x) => x.code === "negative-on-hand" && x.severity === "blocker")).toBe(true);
  });

  it("inventory loss line → Part X warning", () => {
    const f = deterministicAnomalies({
      snapshot: { ...clean, cells: [{ section: "A", line: 30, column: "A_LE16", sub: null, gallons: 12.5 }] },
    });
    expect(f.some((x) => x.code === "loss-needs-partx" && x.severity === "warning")).toBe(true);
  });

  it("5× loss spike vs trailing mean → warning", () => {
    const f = deterministicAnomalies({ snapshot: clean, trailingLossMeanGal: 2, thisPeriodLossGal: 15 });
    expect(f.some((x) => x.code === "loss-spike")).toBe(true);
    // just under 5× → no spike
    const g = deterministicAnomalies({ snapshot: clean, trailingLossMeanGal: 2, thisPeriodLossGal: 9 });
    expect(g.some((x) => x.code === "loss-spike")).toBe(false);
  });
});
