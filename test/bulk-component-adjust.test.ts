import { describe, it, expect } from "vitest";
import {
  planComponentVolumeUpdate,
  BLEND_MISMATCH_EPS_L,
} from "@/lib/bulk/component-adjust";

/**
 * The /bulk composition editor hydrates its volume input with the component PROJECTION
 * (vessel_component.volumeL), while updateComponentVolume adjusts the tuple's LOTS. The plan
 * function is the seam that keeps those two honest with each other.
 *
 * The blend numbers are the live repro (Demo Winery T5, lot 2026-SY-2): vessel_lot tuple total
 * 6995 L, Syrah component projection 6370 L. Saving the untouched displayed 6370 used to write
 * a real −625 L ADJUST.
 */
describe("planComponentVolumeUpdate", () => {
  describe("blend lot: projection diverges from the tuple total", () => {
    const blend = { projectionL: 6370, tupleTotalL: 6995 };

    it("regression: saving the displayed projection unchanged is a no-op, not a −625 L draw", () => {
      expect(planComponentVolumeUpdate({ targetL: 6370, ...blend })).toEqual({ kind: "NO_OP" });
    });

    it("an actual edit is refused — a lot draw cannot set a lineage share to an exact number", () => {
      expect(planComponentVolumeUpdate({ targetL: 6400, ...blend })).toEqual({
        kind: "BLOCKED_BLEND_SHARE",
        projectionL: 6370,
        tupleTotalL: 6995,
      });
    });

    it("typing the tuple total is still refused (it is not the number the editor displayed)", () => {
      // Under the old target-the-tuple semantics this was a silent no-op; under share semantics
      // the user typed a change into a 6370 field, so they get the explanation, not silence.
      expect(planComponentVolumeUpdate({ targetL: 6995, ...blend }).kind).toBe("BLOCKED_BLEND_SHARE");
    });
  });

  describe("single-origin lot: projection matches the tuple total", () => {
    const pure = { projectionL: 6995, tupleTotalL: 6995 };

    it("saving the displayed number unchanged is a no-op", () => {
      expect(planComponentVolumeUpdate({ targetL: 6995, ...pure })).toEqual({ kind: "NO_OP" });
    });

    it("a real edit adjusts by the difference against the tuple total", () => {
      expect(planComponentVolumeUpdate({ targetL: 7000, ...pure })).toEqual({ kind: "ADJUST", deltaL: 5 });
      expect(planComponentVolumeUpdate({ targetL: 6900, ...pure })).toEqual({ kind: "ADJUST", deltaL: -95 });
    });

    it("sub-centiliter float noise from unit round-trips is not an edit", () => {
      expect(planComponentVolumeUpdate({ targetL: 6995.004, ...pure })).toEqual({ kind: "NO_OP" });
    });
  });

  describe("rounding drift below the blend threshold is tolerated", () => {
    // Decimal(6,5) lineage fractions can leave the projection a few centiliters off the lot sum
    // without the vessel being a blend; that must not lock the editor.
    const drift = { projectionL: 6994.97, tupleTotalL: 6995 };

    it("untouched save is a no-op", () => {
      expect(planComponentVolumeUpdate({ targetL: 6994.97, ...drift })).toEqual({ kind: "NO_OP" });
    });

    it("a real edit still adjusts, with the delta taken against the tuple total", () => {
      expect(planComponentVolumeUpdate({ targetL: 7000, ...drift })).toEqual({ kind: "ADJUST", deltaL: 5 });
    });

    it("divergence beyond the threshold flips to the blend refusal", () => {
      const justOver = { projectionL: round2(6995 - (BLEND_MISMATCH_EPS_L + 0.01)), tupleTotalL: 6995 };
      expect(planComponentVolumeUpdate({ targetL: 7000, ...justOver }).kind).toBe("BLOCKED_BLEND_SHARE");
    });
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
