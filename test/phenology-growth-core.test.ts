import { describe, expect, it } from "vitest";
import {
  BAND_EDGES_CM,
  LEAF_EXPANSION_TAIL_DAYS,
  SHOOT_THRESHOLD_CM,
  estimateGrowthCore,
  type GrowthObservation,
} from "@/lib/phenology/growth-core";
import { formatShootLength, formatShootLengthRange } from "@/lib/phenology/units";

function obs(over: Partial<GrowthObservation> & { date: string }): GrowthObservation {
  return {
    shootLengthCm: null,
    shootLengthBand: null,
    shootTip: "ACTIVE",
    hedgedThisWeek: null,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The base model — brief §5.1's shape.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("measured growth (the brief §5.1 shape)", () => {
  it("pre-bloom extension leaves ~a third of leaf area unprotected in 4 days", () => {
    // 8 cm → 12 cm over 4 days = 7 cm/week ≈ 2.75 in/week, inside the brief's 1–3 in/week band.
    const r = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-18", shootLengthCm: 8 }),
        obs({ date: "2026-05-22", shootLengthCm: 12 }),
      ],
      sinceDate: "2026-05-18",
      targetDate: "2026-05-22",
    });
    expect(r.basis).toBe("MEASURED");
    expect(r.cmPerWeek).toBeCloseTo(7, 4);
    expect(r.unprotectedNewLeafFraction).toBeCloseTo(1 / 3, 3);
    expect(r.unprotectedNewLeafFraction!).toBeGreaterThan(0.3);
    expect(r.unprotectedNewLeafFraction!).toBeLessThan(0.4);
    expect(r.confidence).toBe("HIGH");
  });

  it("clamps the unprotected fraction into [0,1]", () => {
    const shrunk = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-18", shootLengthCm: 20 }),
        obs({ date: "2026-05-25", shootLengthCm: 18 }), // measurement noise, no hedge recorded
      ],
      sinceDate: "2026-05-18",
      targetDate: "2026-05-25",
    });
    expect(shrunk.unprotectedNewLeafFraction).toBeGreaterThanOrEqual(0);
    expect(shrunk.unprotectedNewLeafFraction).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// COUNCIL C6 — the single most important test in this phase.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("STAGNANT does NOT mean zero growth dilution (council C6)", () => {
  /** Tip stopped on May 1; length flat at 90 cm ever since. A naive model reports zero dilution. */
  const stagnant: GrowthObservation[] = [
    obs({ date: "2026-05-01", shootLengthCm: 90, shootTip: "STAGNANT" }),
    obs({ date: "2026-05-08", shootLengthCm: 90, shootTip: "STAGNANT" }),
    obs({ date: "2026-05-15", shootLengthCm: 90, shootTip: "STAGNANT" }),
    obs({ date: "2026-05-22", shootLengthCm: 90, shootTip: "STAGNANT" }),
  ];

  it("THE GOLDEN: stagnant at day 0 still yields a NON-ZERO unprotected fraction at day 7", () => {
    const r = estimateGrowthCore({
      observations: stagnant,
      sinceDate: "2026-05-01",
      targetDate: "2026-05-08",
    });
    // Shoot length is identical at both ends. The length difference alone says 0 % unprotected —
    // which would tell a grower the canopy is fully covered when it is materially diluted, and
    // they would skip a spray on the strength of it.
    expect(r.unprotectedNewLeafFraction).toBeGreaterThan(0);
    expect(r.basis).toBe("LEAF_EXPANSION_TAIL");
    expect(r.confidence).toBe("LOW");
  });

  it("the tail DECAYS — day 0–7 dilutes more than day 7–14", () => {
    const early = estimateGrowthCore({ observations: stagnant, sinceDate: "2026-05-01", targetDate: "2026-05-08" });
    const late = estimateGrowthCore({ observations: stagnant, sinceDate: "2026-05-08", targetDate: "2026-05-15" });
    expect(late.unprotectedNewLeafFraction!).toBeGreaterThan(0);
    expect(late.unprotectedNewLeafFraction!).toBeLessThan(early.unprotectedNewLeafFraction!);
  });

  it("...and settles to zero once the tail has run out (~14 days)", () => {
    expect(LEAF_EXPANSION_TAIL_DAYS).toBeGreaterThanOrEqual(14);
    const spent = estimateGrowthCore({
      observations: stagnant,
      sinceDate: "2026-05-15", // 14 days after the tip stopped — the tail is exhausted
      targetDate: "2026-05-22",
    });
    expect(spent.unprotectedNewLeafFraction).toBe(0);
    expect(spent.basis).toBe("MEASURED");
  });

  it("an ACTIVE tip carries no tail — the length difference already holds that growth", () => {
    const active = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-01", shootLengthCm: 90, shootTip: "ACTIVE" }),
        obs({ date: "2026-05-08", shootLengthCm: 90, shootTip: "ACTIVE" }),
      ],
      sinceDate: "2026-05-01",
      targetDate: "2026-05-08",
    });
    expect(active.unprotectedNewLeafFraction).toBe(0);
    expect(active.basis).toBe("MEASURED");
  });

  it("a re-stagnation after a lateral flush restarts the tail, not an exhausted clock", () => {
    const restarted = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-01", shootLengthCm: 90, shootTip: "STAGNANT" }),
        obs({ date: "2026-05-08", shootLengthCm: 96, shootTip: "ACTIVE" }), // lateral flush
        obs({ date: "2026-05-15", shootLengthCm: 96, shootTip: "STAGNANT" }), // stops again
        obs({ date: "2026-05-22", shootLengthCm: 96, shootTip: "STAGNANT" }),
      ],
      sinceDate: "2026-05-15",
      targetDate: "2026-05-22",
    });
    // Onset is May 15, not May 1, so the tail is live rather than long since spent.
    expect(restarted.unprotectedNewLeafFraction!).toBeGreaterThan(0);
  });

  it("never reports LESS dilution than the tail alone implies", () => {
    const r = estimateGrowthCore({ observations: stagnant, sinceDate: "2026-05-01", targetDate: "2026-05-08" });
    const tailOnly = estimateGrowthCore({
      observations: [obs({ date: "2026-05-01", shootTip: "STAGNANT", shootLengthCm: 90 })],
      sinceDate: "2026-05-01",
      targetDate: "2026-05-08",
    });
    expect(r.unprotectedNewLeafFraction!).toBeGreaterThanOrEqual(tailOnly.unprotectedNewLeafFraction!);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// COUNCIL C7 — hedging is an event; refuse, then recover.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("hedging (council C7)", () => {
  const hedged: GrowthObservation[] = [
    obs({ date: "2026-06-01", shootLengthCm: 120 }),
    obs({ date: "2026-06-08", shootLengthCm: 70, hedgedThisWeek: true }), // tissue removed
    obs({ date: "2026-06-15", shootLengthCm: 82 }), // lateral flush after the hedge
  ];

  it("a span containing a hedge returns unknown — never a negative, never a zero", () => {
    const r = estimateGrowthCore({ observations: hedged, sinceDate: "2026-06-01", targetDate: "2026-06-08" });
    expect(r.reasonCode).toBe("HEDGE_IN_SPAN");
    expect(r.cmPerWeek).toBeNull();
    expect(r.unprotectedNewLeafFraction).toBeNull();
    expect(r.unprotectedNewLeafFraction).not.toBe(0); // a zero reads as MORE protection than reality
    expect(r.basis).toBe("UNKNOWN");
  });

  it("the refusal still names the flush, so nobody reads it as a static canopy", () => {
    const r = estimateGrowthCore({ observations: hedged, sinceDate: "2026-06-01", targetDate: "2026-06-08" });
    expect(r.reason).toContain("lateral growth");
    expect(r.reason).toContain("2026-06-08");
  });

  it("the week AFTER the hedge starts a FRESH baseline rather than staying unknown", () => {
    const r = estimateGrowthCore({ observations: hedged, sinceDate: "2026-06-08", targetDate: "2026-06-15" });
    expect(r.reasonCode).toBeNull();
    expect(r.basis).toBe("MEASURED");
    expect(r.cmPerWeek).toBeCloseTo(12, 4); // 70 → 82 in 7 days
    expect(r.unprotectedNewLeafFraction).toBeCloseTo(12 / 82, 4);
  });

  it("hedgedThisWeek: false does NOT trigger the refusal", () => {
    const r = estimateGrowthCore({
      observations: [
        obs({ date: "2026-06-01", shootLengthCm: 60, hedgedThisWeek: false }),
        obs({ date: "2026-06-08", shootLengthCm: 75, hedgedThisWeek: false }),
      ],
      sinceDate: "2026-06-01",
      targetDate: "2026-06-08",
    });
    expect(r.reasonCode).toBeNull();
    expect(r.cmPerWeek).toBeCloseTo(15, 4);
  });

  it("the threshold answer survives the refusal — S5b can still run the 3-10 rule", () => {
    const r = estimateGrowthCore({ observations: hedged, sinceDate: "2026-06-01", targetDate: "2026-06-08" });
    expect(r.shootsAtLeast10cm).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// COUNCIL C8 — bands never produce a point rate.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("bands are ranges, never points (council C8)", () => {
  const banded: GrowthObservation[] = [
    obs({ date: "2026-05-18", shootLengthBand: "CM_10_30" }),
    obs({ date: "2026-05-25", shootLengthBand: "CM_30_60" }),
  ];

  it("band-only input yields a RANGE and NO point rate", () => {
    const r = estimateGrowthCore({ observations: banded, sinceDate: "2026-05-18", targetDate: "2026-05-25" });
    expect(r.basis).toBe("BAND_RANGE");
    expect(r.cmPerWeek).toBeNull();
    expect(r.cmPerWeekRange).not.toBeNull();
    expect(r.unprotectedNewLeafFraction).toBeNull();
    expect(r.unprotectedNewLeafRange).not.toBeNull();
  });

  it("CM_10_30 → CM_30_60 NEVER reports a single 55 % figure", () => {
    // Midpoints give (45−20)/45 = 55.6 %. The truth might be 29 → 31 cm, i.e. ~6 %. A point
    // estimate built from bucket midpoints is fiction with a decimal point on it.
    const r = estimateGrowthCore({ observations: banded, sinceDate: "2026-05-18", targetDate: "2026-05-25" });
    expect(r.unprotectedNewLeafFraction).toBeNull();
    const range = r.unprotectedNewLeafRange!;
    // The honest answer spans the near-nothing case AND the large-move case.
    expect(range.min).toBeLessThan(0.1); // 30 → 30: essentially no new tissue
    expect(range.max).toBeGreaterThan(0.5); // 10 → 60: a lot of new tissue
    expect(range.min).toBeLessThan(range.max);
  });

  it("a mixed measured/banded pair is still a range — one exact end does not rescue it", () => {
    const r = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-18", shootLengthCm: 22 }),
        obs({ date: "2026-05-25", shootLengthBand: "CM_30_60" }),
      ],
      sinceDate: "2026-05-18",
      targetDate: "2026-05-25",
    });
    expect(r.cmPerWeek).toBeNull();
    expect(r.cmPerWeekRange).not.toBeNull();
  });

  it("the range never goes negative", () => {
    const shrinking = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-18", shootLengthBand: "CM_30_60" }),
        obs({ date: "2026-05-25", shootLengthBand: "CM_10_30" }),
      ],
      sinceDate: "2026-05-18",
      targetDate: "2026-05-25",
    });
    expect(shrinking.cmPerWeekRange!.min).toBeGreaterThanOrEqual(0);
    expect(shrinking.unprotectedNewLeafRange!.min).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The threshold — the band's actual purpose (D4).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("shootsAtLeast10cm is EXACT (the downy 3-10 rule)", () => {
  it("is answered exactly from a band alone", () => {
    const below = estimateGrowthCore({
      observations: [obs({ date: "2026-05-10", shootLengthBand: "LT_10" })],
      sinceDate: "2026-05-03",
      targetDate: "2026-05-10",
    });
    expect(below.shootsAtLeast10cm).toBe(false);
    for (const band of ["CM_10_30", "CM_30_60", "GT_60"] as const) {
      const r = estimateGrowthCore({
        observations: [obs({ date: "2026-05-10", shootLengthBand: band })],
        sinceDate: "2026-05-03",
        targetDate: "2026-05-10",
      });
      expect(r.shootsAtLeast10cm, band).toBe(true);
    }
  });

  it("a single observation gives an UNKNOWN rate but still answers the threshold", () => {
    const r = estimateGrowthCore({
      observations: [obs({ date: "2026-05-10", shootLengthCm: 14 })],
      sinceDate: "2026-05-03",
      targetDate: "2026-05-10",
    });
    expect(r.cmPerWeek).toBeNull();
    expect(r.cmPerWeekRange).toBeNull();
    expect(r.reasonCode).toBe("SINGLE_OBSERVATION");
    expect(r.shootsAtLeast10cm).toBe(true);
  });

  it("sits exactly on the boundary the rule names", () => {
    const at10 = estimateGrowthCore({
      observations: [obs({ date: "2026-05-10", shootLengthCm: SHOOT_THRESHOLD_CM })],
      sinceDate: "2026-05-03",
      targetDate: "2026-05-10",
    });
    expect(at10.shootsAtLeast10cm).toBe(true);
    const justUnder = estimateGrowthCore({
      observations: [obs({ date: "2026-05-10", shootLengthCm: 9.9 })],
      sinceDate: "2026-05-03",
      targetDate: "2026-05-10",
    });
    expect(justUnder.shootsAtLeast10cm).toBe(false);
  });

  it("the band edges line up with the threshold — LT_10 is the only false", () => {
    expect(BAND_EDGES_CM.LT_10.max).toBe(SHOOT_THRESHOLD_CM);
    expect(BAND_EDGES_CM.CM_10_30.min).toBe(SHOOT_THRESHOLD_CM);
  });

  it("is null only when nothing at all was recorded", () => {
    const r = estimateGrowthCore({
      observations: [obs({ date: "2026-05-10" })],
      sinceDate: "2026-05-03",
      targetDate: "2026-05-10",
    });
    expect(r.shootsAtLeast10cm).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// COUNCIL C5 — degenerate input.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("degenerate length (council C5)", () => {
  it("L_now = 0 returns unknown — never NaN, never 0, never 1", () => {
    const r = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-18", shootLengthCm: 20 }),
        obs({ date: "2026-05-25", shootLengthCm: 0 }),
      ],
      sinceDate: "2026-05-18",
      targetDate: "2026-05-25",
    });
    expect(r.reasonCode).toBe("DEGENERATE_LENGTH");
    expect(r.unprotectedNewLeafFraction).toBeNull();
    expect(r.unprotectedNewLeafFraction).not.toBeNaN();
    expect(r.reason).toContain("not zero new growth");
  });

  it("no observations at all is a refusal, not a zero", () => {
    const r = estimateGrowthCore({ observations: [], sinceDate: "2026-05-18", targetDate: "2026-05-25" });
    expect(r.reasonCode).toBe("NO_OBSERVATIONS");
    expect(r.unprotectedNewLeafFraction).toBeNull();
    expect(r.shootsAtLeast10cm).toBeNull();
  });

  it("observations AFTER the target date are ignored, not read as the present", () => {
    const r = estimateGrowthCore({
      observations: [
        obs({ date: "2026-05-18", shootLengthCm: 20 }),
        obs({ date: "2026-05-25", shootLengthCm: 40 }),
        obs({ date: "2026-06-10", shootLengthCm: 95 }), // in the future relative to the question
      ],
      sinceDate: "2026-05-18",
      targetDate: "2026-05-25",
    });
    expect(r.toDate).toBe("2026-05-25");
    expect(r.cmPerWeek).toBeCloseTo(20, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Units (the §5 documented deviation).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("shoot-length formatting", () => {
  it("renders metric and imperial", () => {
    expect(formatShootLength(25, "METRIC")).toBe("25 cm");
    expect(formatShootLength(25.4, "IMPERIAL")).toBe("10 in");
    expect(formatShootLength(null, "METRIC")).toBe("—");
  });

  it("renders a range as a range — never collapsed to an average", () => {
    expect(formatShootLengthRange(10, 30, "METRIC")).toBe("10–30 cm");
    expect(formatShootLengthRange(10, 30, "METRIC")).not.toContain("20");
  });
});
