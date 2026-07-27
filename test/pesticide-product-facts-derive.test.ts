import { describe, it, expect } from "vitest";
import { rollUpGrapeSiteIntervals } from "@/lib/pesticide/product-facts-derive";

// Spray S2b Unit 2 — the most-restrictive-recorded rollup (probe §5), mirroring S2's K13 pattern.

describe("rollUpGrapeSiteIntervals", () => {
  it("a single grape site row passes through unchanged, no conflict", () => {
    const r = rollUpGrapeSiteIntervals([{ siteCode: 1014, phiDays: 14, reiHours: 12 }]);
    expect(r).toEqual({ phiDays: 14, reiHours: 12, phiConflict: false, reiConflict: false });
  });

  it("agreeing rows across all three grape site codes: no conflict", () => {
    const r = rollUpGrapeSiteIntervals([
      { siteCode: 1014, phiDays: 66, reiHours: 24 },
      { siteCode: 29141, phiDays: 66, reiHours: 24 },
      { siteCode: 29143, phiDays: 66, reiHours: 24 },
    ]);
    expect(r).toEqual({ phiDays: 66, reiHours: 24, phiConflict: false, reiConflict: false });
  });

  it("disagreeing rows take the MOST RESTRICTIVE (longest) value and flag the conflict — probe's EMPOWER case (12h vs 13d PHI)", () => {
    const r = rollUpGrapeSiteIntervals([
      { siteCode: 1014, phiDays: 1, reiHours: 12 },
      { siteCode: 29141, phiDays: 13, reiHours: 12 },
    ]);
    expect(r.phiDays).toBe(13); // the longer of 1 and 13 wins — never averaged, never "pick one"
    expect(r.phiConflict).toBe(true);
    expect(r.reiConflict).toBe(false); // REI agreed across both rows
  });

  it("a row recorded on one grape site but blank on another: the recorded value wins, no conflict (a null contributes nothing)", () => {
    const r = rollUpGrapeSiteIntervals([
      { siteCode: 1014, phiDays: 7, reiHours: null },
      { siteCode: 29141, phiDays: null, reiHours: null },
    ]);
    expect(r.phiDays).toBe(7);
    expect(r.phiConflict).toBe(false);
    expect(r.reiHours).toBeNull();
    expect(r.reiConflict).toBe(false);
  });

  it("no grape site row recorded anything: both null, no conflict — this is NOT RECORDED, never zero", () => {
    const r = rollUpGrapeSiteIntervals([
      { siteCode: 1014, phiDays: null, reiHours: null },
      { siteCode: 29143, phiDays: null, reiHours: null },
    ]);
    expect(r).toEqual({ phiDays: null, reiHours: null, phiConflict: false, reiConflict: false });
  });

  it("an empty row set (no grape sites at all) resolves to nulls, not a throw", () => {
    expect(rollUpGrapeSiteIntervals([])).toEqual({ phiDays: null, reiHours: null, phiConflict: false, reiConflict: false });
  });
});
