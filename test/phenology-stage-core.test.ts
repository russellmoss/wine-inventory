import { describe, expect, it } from "vitest";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";
import {
  MAX_BIOFIX_AGE_DAYS,
  MIN_SPAN_COMPLETENESS,
  PHASE_HORIZON_DAYS,
  estimatePhenologyStageCore,
  fromCoordinate,
  ladderCoordinate,
  toCoordinate,
  type PhenologyAnchor,
} from "@/lib/phenology/stage-core";
import { PHENO_PCT_OPTIONS, phenoStageUsesPct } from "@/lib/fieldnotes/types";

// Constant-temperature series, copying the generator style in test/weather-normals.test.ts, so
// every golden is arithmetic: at tmax 30 / tmin 10, daily GDD = (30+10)/2 − 10 = 10 °C exactly,
// which makes "day N has 10N GDD" a fact rather than a fixture lookup.
function days(startIso: string, count: number, tmaxC = 30, tminC = 10): LocalDailyRecord[] {
  const out: LocalDailyRecord[] = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push({
      localDate: d.toISOString().slice(0, 10),
      tmaxC,
      tminC,
      precipMm: 0,
      rhMaxPct: null,
      rhMinPct: null,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const LAT_NY = 42.5; // Finger Lakes — an ordinary Northern site
const BIOFIX: PhenologyAnchor = { date: "2026-04-15", stage: "BUD_BREAK", stagePct: 25 };
/** 200 days of 10 GDD/day from bud break — enough to reach harvest on the ladder. */
const SEASON = days("2026-04-15", 200);

function estimate(over: Partial<Parameters<typeof estimatePhenologyStageCore>[0]> = {}) {
  return estimatePhenologyStageCore({
    anchors: [BIOFIX],
    dailyRecords: SEASON,
    latitude: LAT_NY,
    targetDate: "2026-04-20",
    ...over,
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The monotone coordinate (council C3)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the phenology coordinate", () => {
  it("is monotone across stages and within a stage", () => {
    expect(toCoordinate("BUD_BREAK", 25)).toBeLessThan(toCoordinate("BUD_BREAK", 75));
    expect(toCoordinate("BUD_BREAK", 75)).toBeLessThan(toCoordinate("FLOWERING", 5));
    expect(toCoordinate("FLOWERING", 100)).toBeLessThanOrEqual(toCoordinate("FRUIT_SET", null));
    expect(toCoordinate("FRUIT_SET", null)).toBeLessThan(toCoordinate("VERAISON", 5));
  });

  it("puts a no-pct stage exactly on its integer, ignoring a stray pct", () => {
    expect(toCoordinate("FRUIT_SET", 50)).toBe(toCoordinate("FRUIT_SET", null));
  });

  it("NEVER emits an illegal pct, anywhere on the scale", () => {
    for (let c = 0; c <= 7; c += 0.017) {
      const { stage, stagePct } = fromCoordinate(c);
      if (!phenoStageUsesPct(stage)) {
        expect(stagePct, `stage ${stage} must not carry a pct`).toBeNull();
      } else {
        expect(PHENO_PCT_OPTIONS as readonly number[], `coord ${c} -> ${stage} ${stagePct}`).toContain(stagePct!);
      }
    }
  });

  it("emits stagePct null for a stage that does not take one (C3)", () => {
    expect(fromCoordinate(3.4).stage).toBe("FRUIT_SET");
    expect(fromCoordinate(3.4).stagePct).toBeNull();
  });

  it("clamps out-of-range coordinates instead of producing an undefined stage", () => {
    expect(fromCoordinate(-5).stage).toBe("DORMANT");
    expect(fromCoordinate(99).stage).toBe("POST_HARVEST");
  });
});

describe("the modeled ladder", () => {
  it("is monotone non-decreasing in GDD", () => {
    let prev = -Infinity;
    for (let g = 0; g <= 1600; g += 25) {
      const c = ladderCoordinate(g);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("clamps at HARVEST and never auto-advances to POST_HARVEST", () => {
    expect(fromCoordinate(ladderCoordinate(9999)).stage).toBe("HARVEST");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The provenance ladder
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("OBSERVED", () => {
  it("a field note ON the target date is returned verbatim, HIGH confidence", () => {
    const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "FLOWERING", stagePct: 75 }];
    const r = estimate({ anchors, targetDate: "2026-06-01" });
    expect(r.source).toBe("OBSERVED");
    expect(r.stage).toBe("FLOWERING");
    expect(r.stagePct).toBe(75);
    expect(r.anchorAgeDays).toBe(0);
    expect(r.confidence).toBe("HIGH");
  });

  it("an observation is never perturbed by quantization", () => {
    for (const pct of PHENO_PCT_OPTIONS) {
      const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "VERAISON", stagePct: pct }];
      expect(estimate({ anchors, targetDate: "2026-06-01" }).stagePct).toBe(pct);
    }
  });
});

describe("INTERPOLATED", () => {
  const anchors: PhenologyAnchor[] = [
    BIOFIX,
    { date: "2026-06-01", stage: "FLOWERING", stagePct: 5 },
    { date: "2026-07-01", stage: "VERAISON", stagePct: 5 },
  ];

  it("places a between-anchors date and labels it INTERPOLATED, MEDIUM confidence", () => {
    const r = estimate({ anchors, targetDate: "2026-06-16" });
    expect(r.source).toBe("INTERPOLATED");
    expect(r.confidence).toBe("MEDIUM");
    expect(r.stage).not.toBeNull();
    expect(r.anchorDate).toBe("2026-06-01");
  });

  it("the GDD-weighted midpoint DIFFERS from the calendar midpoint in an uneven season", () => {
    // The unevenness has to sit INSIDE the anchor span to matter. Jun 1 – Jun 16 is cold
    // (5 GDD/day), Jun 16 – Jul 1 is hot (15 GDD/day). By Jun 16 half the CALENDAR between the
    // two observations has passed but only a quarter of the HEAT, so a GDD interpolation must
    // land materially behind a day-count one. That gap is the entire reason to use degree days.
    const uneven = [
      ...days("2026-04-15", 47), // Apr 15 – May 31, ordinary
      ...days("2026-06-01", 15, 20, 10), // Jun 1 – Jun 15:  5 GDD/day
      ...days("2026-06-16", 46, 40, 10), // Jun 16 – Jul 31: 15 GDD/day
    ];
    const gddRun = estimatePhenologyStageCore({ anchors, dailyRecords: uneven, latitude: LAT_NY, targetDate: "2026-06-16" });
    const evenRun = estimatePhenologyStageCore({ anchors, dailyRecords: SEASON, latitude: LAT_NY, targetDate: "2026-06-16" });
    expect(gddRun.source).toBe("INTERPOLATED");
    expect(evenRun.source).toBe("INTERPOLATED");
    const coordOf = (r: typeof gddRun) => toCoordinate(r.stage!, r.stagePct);
    // Same calendar day, same anchors — a colder run-up places the block EARLIER in the season.
    expect(coordOf(gddRun)).toBeLessThan(coordOf(evenRun));
  });

  it("never emits an illegal pct when interpolating ACROSS a stage boundary (C3)", () => {
    const crossing: PhenologyAnchor[] = [
      BIOFIX,
      { date: "2026-06-01", stage: "FLOWERING", stagePct: 75 },
      { date: "2026-06-20", stage: "FRUIT_SET", stagePct: null },
    ];
    for (let d = 2; d <= 19; d++) {
      const target = `2026-06-${String(d).padStart(2, "0")}`;
      const r = estimatePhenologyStageCore({ anchors: crossing, dailyRecords: SEASON, latitude: LAT_NY, targetDate: target });
      if (r.stage === null) continue;
      if (phenoStageUsesPct(r.stage)) {
        expect(PHENO_PCT_OPTIONS as readonly number[], `${target} -> ${r.stage} ${r.stagePct}`).toContain(r.stagePct!);
      } else {
        expect(r.stagePct, `${target} -> ${r.stage}`).toBeNull();
      }
    }
  });

  it("refuses when NO heat accumulated between the two anchors, rather than under-stating", () => {
    // Under-stating stage reads as "no fruit present", which would let an interlock clear a
    // spray it should block. Refusing is the safe direction.
    const frozen = days("2026-04-15", 200, 5, -5); // never above base 10 → 0 GDD every day
    const r = estimatePhenologyStageCore({ anchors, dailyRecords: frozen, latitude: LAT_NY, targetDate: "2026-06-16" });
    expect(r.stage).toBeNull();
    expect(r.reasonCode).toBe("NO_GDD_SPAN");
  });
});

describe("MODELED", () => {
  const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "FLOWERING", stagePct: 50 }];

  it("projects past the last anchor and labels it MODELED, LOW confidence", () => {
    const r = estimate({ anchors, targetDate: "2026-06-10" });
    expect(r.source).toBe("MODELED");
    expect(r.confidence).toBe("LOW");
    expect(r.anchorDate).toBe("2026-06-01");
    expect(r.anchorAgeDays).toBe(9);
  });

  it("NEVER walks backward from something a human actually saw", () => {
    for (let d = 2; d <= 14; d++) {
      const r = estimate({ anchors, targetDate: `2026-06-${String(d).padStart(2, "0")}` });
      if (r.stage === null) continue;
      expect(toCoordinate(r.stage, r.stagePct)).toBeGreaterThanOrEqual(toCoordinate("FLOWERING", 50));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Refusals. Each one is "cannot determine safely", a first-class output — never an error.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("refusals", () => {
  it("NO BUD-BREAK BIOFIX ⇒ refuse — never fall back to Apr 1 (D11 / council C9)", () => {
    const r = estimate({ anchors: [{ date: "2026-06-01", stage: "FLOWERING", stagePct: 50 }], targetDate: "2026-06-05" });
    expect(r.stage).toBeNull();
    expect(r.reasonCode).toBe("NO_BIOFIX");
    expect(r.reason).toContain("bud break");
    expect(r.gddSinceBiofix).toBeNull();
  });

  it("a bud break older than a season is refused, not silently inherited", () => {
    const stale: PhenologyAnchor[] = [{ date: "2025-04-15", stage: "BUD_BREAK", stagePct: 25 }];
    const r = estimatePhenologyStageCore({
      anchors: stale,
      dailyRecords: days("2025-04-15", 500),
      latitude: LAT_NY,
      targetDate: "2026-07-01",
    });
    expect(r.reasonCode).toBe("NO_BIOFIX");
    expect(MAX_BIOFIX_AGE_DAYS).toBeLessThan(365);
  });

  it("a FUTURE target date ⇒ unknown (council S5) — nothing reads forecast GDD yet", () => {
    const r = estimate({ dailyRecords: days("2026-04-15", 30), targetDate: "2026-08-01" });
    expect(r.stage).toBeNull();
    expect(r.reasonCode).toBe("FUTURE_TARGET");
    expect(r.reason).toContain("forecast");
  });

  it("THE NAMED DEGRADE: no field note for 3 weeks in a fast phase ⇒ refuse", () => {
    // Runbook §9 S4 names this case. FLOWERING's horizon is 14 days; 21 days is past it.
    const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "FLOWERING", stagePct: 50 }];
    const r = estimate({ anchors, targetDate: "2026-06-22" });
    expect(r.stage).toBeNull();
    expect(r.reasonCode).toBe("ANCHOR_TOO_OLD");
    expect(r.anchorAgeDays).toBe(21);
    expect(r.reason).toContain("Walk the block");
  });

  it("the phase-scaled horizon holds at BOTH edges, in a fast phase (council DQ3 / D3)", () => {
    const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "FLOWERING", stagePct: 50 }];
    const h = PHASE_HORIZON_DAYS.FLOWERING; // 14
    expect(h).toBe(14);
    expect(estimate({ anchors, targetDate: "2026-06-15" }).source).toBe("MODELED"); // exactly 14 → allowed
    expect(estimate({ anchors, targetDate: "2026-06-16" }).reasonCode).toBe("ANCHOR_TOO_OLD"); // 15 → refused
  });

  it("...and is LOOSER after veraison, where 45 days can pass with no transition", () => {
    const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "RIPENING", stagePct: null }];
    expect(PHASE_HORIZON_DAYS.RIPENING).toBe(45);
    // 21 days post-veraison is fine; the same 21 days in flowering refused above.
    expect(estimate({ anchors, targetDate: "2026-06-22" }).source).toBe("MODELED");
    expect(estimate({ anchors, targetDate: "2026-07-16" }).source).toBe("MODELED"); // 45 → allowed
    expect(estimate({ anchors, targetDate: "2026-07-17" }).reasonCode).toBe("ANCHOR_TOO_OLD"); // 46
  });

  it("no observation at or before the target ⇒ refuse", () => {
    const anchors: PhenologyAnchor[] = [
      { date: "2026-04-15", stage: "BUD_BREAK", stagePct: 25 },
      { date: "2026-06-01", stage: "FLOWERING", stagePct: 50 },
    ];
    // Target precedes the biofix itself → there is no biofix at-or-before it.
    const r = estimate({ anchors, targetDate: "2026-04-10" });
    expect(r.stage).toBeNull();
    expect(r.reasonCode).toBe("NO_BIOFIX");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Weather-completeness behaviour (council C4) — refuse on RELEVANT gaps only.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("weather completeness is capped at the target, not at today (council C4)", () => {
  const anchors: PhenologyAnchor[] = [BIOFIX, { date: "2026-06-01", stage: "FLOWERING", stagePct: 50 }];

  it("a HISTORICAL target with a LATER gap does NOT refuse", () => {
    // Complete April–June, then a hole through July. A question about June 8 is unaffected by it.
    const withLaterGap: LocalDailyRecord[] = [
      ...days("2026-04-15", 60), // Apr 15 – Jun 13, complete
      ...days("2026-06-14", 60).map((r) => ({ ...r, tmaxC: null, tminC: null })), // gap
    ];
    const r = estimatePhenologyStageCore({ anchors, dailyRecords: withLaterGap, latitude: LAT_NY, targetDate: "2026-06-08" });
    expect(r.reasonCode).toBeNull();
    expect(r.source).toBe("MODELED");
  });

  it("a target INSIDE a genuinely incomplete window DOES refuse", () => {
    const holed = days("2026-04-15", 60).map((r, i) =>
      i % 3 === 0 ? { ...r, tmaxC: null, tminC: null } : r,
    );
    const r = estimatePhenologyStageCore({ anchors, dailyRecords: holed, latitude: LAT_NY, targetDate: "2026-06-08" });
    expect(r.reasonCode).toBe("INCOMPLETE_WEATHER");
    expect(r.spanCompleteness!).toBeLessThan(MIN_SPAN_COMPLETENESS);
  });

  it("a gap day is never counted as 0 GDD — it is not counted at all", () => {
    const oneGap = days("2026-04-15", 30).map((r, i) => (i === 5 ? { ...r, tmaxC: null, tminC: null } : r));
    // Observed on the target date, so the honesty counters are returned rather than a refusal.
    const withNote: PhenologyAnchor[] = [BIOFIX, { date: "2026-05-14", stage: "FLOWERING", stagePct: 5 }];
    const r = estimatePhenologyStageCore({ anchors: withNote, dailyRecords: oneGap, latitude: LAT_NY, targetDate: "2026-05-14" });
    // 30 days in the window, one with no temps → 29 counted and 290 GDD. NOT 300 (which would
    // mean the gap was filled) and NOT 30 days counted with a zero (which would flatten the curve
    // and under-state the stage).
    expect(r.daysCounted).toBe(29);
    expect(r.gddSinceBiofix).toBeCloseTo(290, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The tenant this whole design decision exists to protect.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Bhutan: a live tenant the NH calendar window would silently truncate (council C9)", () => {
  const LAT_BHUTAN = 27.0;

  it("accumulates GDD for a season running OUTSIDE the Apr 1 – Oct 31 window", () => {
    // Bud break in February, target in March — entirely before the hard-coded NH season start.
    // Anchored to the calendar window this returns nothing; anchored to the biofix it just works.
    const anchors: PhenologyAnchor[] = [
      { date: "2026-02-10", stage: "BUD_BREAK", stagePct: 25 },
      { date: "2026-03-12", stage: "FLOWERING", stagePct: 5 },
    ];
    const r = estimatePhenologyStageCore({
      anchors,
      dailyRecords: days("2026-02-10", 60),
      latitude: LAT_BHUTAN,
      targetDate: "2026-03-12",
    });
    expect(r.stage).not.toBeNull();
    expect(r.reasonCode).toBeNull();
    expect(r.gddSinceBiofix).toBeCloseTo(310, 5); // 31 days × 10 GDD
    expect(r.biofixDate).toBe("2026-02-10");
  });

  it("keeps accumulating PAST Oct 31, which the calendar window would cut off", () => {
    const anchors: PhenologyAnchor[] = [
      { date: "2026-06-01", stage: "BUD_BREAK", stagePct: 25 },
      { date: "2026-10-25", stage: "RIPENING", stagePct: null },
    ];
    const r = estimatePhenologyStageCore({
      anchors,
      dailyRecords: days("2026-06-01", 200),
      latitude: LAT_BHUTAN,
      targetDate: "2026-11-20",
    });
    expect(r.reasonCode).toBeNull();
    expect(r.source).toBe("MODELED");
    // 173 days of 10 GDD/day — a calendar-windowed accumulation would have stopped at Oct 31.
    expect(r.gddSinceBiofix).toBeGreaterThan(1400);
  });
});
