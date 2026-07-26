/**
 * S0 Unit 4 — goldens for the leaf-wetness estimators.
 *
 * Written BEFORE the implementation (the plan's execution note says test-first) and deliberately
 * placed under `test/` rather than `scripts/`: the plan allowed either, and this is the choice that
 * makes the goldens actually outlive the spike. `vitest.config.ts` only picks up `test/**` , so
 * assertions living next to the script would run when somebody remembered to run the script, which
 * is not what "S1 inherits them" means.
 *
 * These goldens are about the ESTIMATOR'S DECISION STRUCTURE, not about whether 3.7 °C is the right
 * dew-point-depression threshold. Nothing here validates against measured leaf wetness, because
 * there is no measured leaf wetness (brief §15). What they pin down is the part that a later refactor
 * can silently break: that a missing input never becomes a dry hour, that the fallback cannot be
 * consumed without its label, and that the tree still answers when a missing input cannot change the
 * outcome.
 */
import { describe, expect, it } from "vitest";
import {
  CART_THRESHOLDS,
  CanopyManagement,
  cart,
  estimateSeries,
  rh90Fallback,
  segmentWetRuns,
  zoneAdjustment,
  type HourInput,
} from "../scripts/s0-lwd";

/** Build an hour with sane defaults, overriding only what a case is about. */
function hour(over: Partial<HourInput> = {}): HourInput {
  return {
    hourStartUtc: "2024-06-01T04:00:00Z",
    localHour: 0,
    tempC: 15,
    dewPointC: 5,
    relativeHumidityPct: 50,
    windMs: 3,
    precipMm: 0,
    ...over,
  };
}

describe("CART — the decision tree", () => {
  it("calls a clear dew night WET: small dew-point depression, calm", () => {
    // T 12 °C, Td 11 °C → DPD 1.0 °C, well under the 3.7 °C node; wind 0.5 m/s under 2.5.
    const r = cart(hour({ tempC: 12, dewPointC: 11, relativeHumidityPct: 94, windMs: 0.5, localHour: 2 }));
    expect(r.state).toBe("WET");
    expect(r.estimator).toBe("CART");
    expect(r.inputsMissing).toEqual([]);
  });

  it("calls a dry afternoon DRY on the first node alone, without needing wind or RH", () => {
    // DPD 15 °C. The tree short-circuits: level 1 decides, so absent wind/RH are irrelevant.
    const r = cart(hour({ tempC: 30, dewPointC: 15, relativeHumidityPct: null, windMs: null, localHour: 14 }));
    expect(r.state).toBe("DRY");
    // NOT a refusal — a short-circuited node is a real answer, even with two inputs absent...
    expect(r.state).not.toBe("CANNOT_DETERMINE");
    // ...and the absence is still RECORDED, because Unit 6's confidence band reads it.
    expect(r.inputsMissing).toEqual(["relativeHumidityPct", "windMs"]);
    // But it did not need them, so this is a fully-determined hour, not a partial one.
    if (r.state === "DRY") expect(r.determinedUnderPartialInputs).toBe(false);
  });

  it("calls a WINDY near-saturated night WET via the RH node, not via wind", () => {
    // DPD 2 °C clears level 1; 6 m/s fails level 2; RH 92% ≥ 87.8 carries level 3.
    const h = hour({ tempC: 14, dewPointC: 12, relativeHumidityPct: 92, windMs: 6, localHour: 3 });
    const r = cart(h);
    expect(r.state).toBe("WET");
    if (r.state === "WET") expect(r.decidedBy).toBe("RELATIVE_HUMIDITY");
  });

  it("uses the RH node only when wind fails to decide it", () => {
    const windy = { tempC: 14, dewPointC: 12, windMs: 6, localHour: 3 };
    expect(cart(hour({ ...windy, relativeHumidityPct: 88 })).state).toBe("WET"); // >= 87.8
    expect(cart(hour({ ...windy, relativeHumidityPct: 87 })).state).toBe("DRY"); // < 87.8
  });
});

/**
 * Discovered while writing these goldens, and it reshapes how Unit 5's Arm A must be read.
 *
 * The plan describes CART and the RH≥90% threshold as two estimators whose "disagreement" gets
 * measured, which invites reading the flip rate as a symmetric error signal. It is not symmetric.
 * On PHYSICALLY CONSISTENT inputs the fallback's wet set is a strict SUBSET of CART's:
 *
 *   RH ≥ 90 %  implies  dew-point depression ≈ 1.2–2.1 °C across every realistic temperature,
 *   which clears CART's 3.7 °C level-1 node, and RH ≥ 90 also clears the 87.8 % level-3 node.
 *   So fallback-WET always implies CART-WET, and CART additionally catches calm hours in the
 *   ~80–90 % RH band that the threshold cannot see.
 *
 * Consequence for Arm A: the disagreement is ONE-SIGNED. Every flip is the fallback under-calling
 * wetness, never the two models erring in opposite directions. So a low flip rate cannot be read as
 * "the two independent methods agree, therefore both are probably right" — they are not
 * independent, one dominates. That is exactly council C1's correlated-error trap, and it means Arm B
 * is not a nice-to-have second opinion but the ONLY arm capable of catching a shared input error.
 */
describe("the estimators are NOT symmetric — the fallback's wet set is a strict subset", () => {
  /** Magnus-Tetens, the standard psychrometric relation. Local to the test on purpose: it exists to
   *  check the estimator's structure, not to become a second implementation the estimator imports. */
  const dewPointFromRh = (tC: number, rhPct: number) => {
    const a = 17.625;
    const b = 243.04;
    const g = Math.log(rhPct / 100) + (a * tC) / (b + tC);
    return (b * g) / (a - g);
  };

  it("fallback-WET implies CART-WET across the whole realistic T × RH × wind space", () => {
    let checked = 0;
    let cartOnly = 0;
    for (let tC = -5; tC <= 40; tC += 2.5) {
      for (let rh = 40; rh <= 100; rh += 1) {
        for (const windMs of [0, 1, 2.4, 2.6, 5, 10]) {
          const h = hour({
            tempC: tC,
            dewPointC: dewPointFromRh(tC, rh),
            relativeHumidityPct: rh,
            windMs,
            precipMm: 0,
          });
          const c = cart(h).state;
          const f = rh90Fallback(h).state;
          checked++;
          if (f === "WET") expect(c).toBe("WET"); // the dominance claim
          if (c === "WET" && f === "DRY") cartOnly++;
        }
      }
    }
    expect(checked).toBeGreaterThan(5_000);
    // and the gap is substantial, not a rounding artifact — this is the hours the threshold misses
    expect(cartOnly / checked).toBeGreaterThan(0.05);
  });

  it("BUT dominance breaks when RH and T/Td come from DIFFERENT providers", () => {
    // Not hypothetical: plan §1.2's hybrid arm is exactly this — ERA5-Land for temperature and RH,
    // ERA5 for wind — and Unit 2 measured a 10-point RH spread between archive models at one hour.
    // Feed a saturated RH beside a dry-air T/Td pair and the estimators genuinely invert.
    const inconsistent = hour({ tempC: 25, dewPointC: 15, relativeHumidityPct: 95, windMs: 6 });
    expect(cart(inconsistent).state).toBe("DRY"); // DPD 10 °C short-circuits at level 1
    expect(rh90Fallback(inconsistent).state).toBe("WET");
    // So any hybrid-provider arm in Unit 5 must be reported separately: its flips have a different
    // meaning from the single-provider flips, and pooling them would blend two distinct effects.
  });
});

describe("a missing input is never a dry hour", () => {
  it("refuses when dew-point depression is unavailable", () => {
    const r = cart(hour({ dewPointC: null }));
    expect(r.state).toBe("CANNOT_DETERMINE");
    if (r.state === "CANNOT_DETERMINE") {
      expect(r.cause).toBe("MISSING_INPUT");
      expect(r.inputsMissing).toContain("dewPointC");
    }
  });

  it("refuses when wind is missing AND the two wind branches disagree", () => {
    // DPD 1 °C (past level 1), wind unknown, RH 60%: calm→WET, windy→DRY. Genuinely undecidable.
    const r = cart(hour({ tempC: 12, dewPointC: 11, windMs: null, relativeHumidityPct: 60, localHour: 2 }));
    expect(r.state).toBe("CANNOT_DETERMINE");
    if (r.state === "CANNOT_DETERMINE") expect(r.inputsMissing).toContain("windMs");
  });

  it("STILL ANSWERS when wind is missing but both wind branches agree", () => {
    // The nuance that separates "an input is absent" from "the answer is unknown". DPD 1 °C and
    // RH 95%: calm→WET, and windy→(RH >= 87.8)→WET. The missing input cannot change the outcome.
    const r = cart(hour({ tempC: 12, dewPointC: 11, windMs: null, relativeHumidityPct: 95, localHour: 2 }));
    expect(r.state).toBe("WET");
    if (r.state === "WET") {
      // Recorded as absent even though the answer stands — Unit 6's confidence band reads this.
      expect(r.inputsMissing).toContain("windMs");
      expect(r.determinedUnderPartialInputs).toBe(true);
    }
  });

  it("refuses rather than guessing when RH is the deciding node and RH is absent", () => {
    const r = cart(hour({ tempC: 12, dewPointC: 11, windMs: 6, relativeHumidityPct: null, localHour: 2 }));
    expect(r.state).toBe("CANNOT_DETERMINE");
  });

  it("distinguishes MISSING_INPUT from INADMISSIBLE_QC — they are not the same refusal", () => {
    const r = cart(hour({ relativeHumidityPct: 95, tempC: 12, dewPointC: 11, windMs: 6, qcAdmissible: false }));
    expect(r.state).toBe("CANNOT_DETERMINE");
    if (r.state === "CANNOT_DETERMINE") expect(r.cause).toBe("INADMISSIBLE_QC");
  });
});

describe("rain is an unambiguous wetting event", () => {
  it("calls a rain hour WET even where the dry-air tree would say dry", () => {
    // Rain falling into unsaturated air: DPD 8 °C would short-circuit to DRY, but the canopy is wet.
    const r = cart(hour({ tempC: 20, dewPointC: 12, precipMm: 2.5, windMs: 4, localHour: 15 }));
    expect(r.state).toBe("WET");
    if (r.state === "WET") expect(r.decidedBy).toBe("PRECIPITATION");
  });

  it("does not treat a trace as a wetting event", () => {
    const r = cart(hour({ tempC: 20, dewPointC: 12, precipMm: 0.05, windMs: 4 }));
    expect(r.state).toBe("DRY");
  });
});

describe("the fallback is labeled inferior at the type level, not in a comment", () => {
  it("carries its own estimator id and an explicit inferiority flag on every hour", () => {
    const r = rh90Fallback(hour({ relativeHumidityPct: 95 }));
    expect(r.state).toBe("WET");
    expect(r.estimator).toBe("RH90_THRESHOLD");
    expect(r.qualityClass).toBe("LABELED_INFERIOR");
  });

  it("marks CART as the preferred estimator, so the two can never be confused downstream", () => {
    expect(cart(hour()).qualityClass).toBe("PREFERRED");
  });

  it("refuses on missing RH rather than defaulting dry", () => {
    const r = rh90Fallback(hour({ relativeHumidityPct: null }));
    expect(r.state).toBe("CANNOT_DETERMINE");
  });

  it("a Madera-shaped season never reaches 90% RH, so the fallback reports zero wet hours", () => {
    // Hot arid interior: RH peaks in the 70s overnight. The fallback says the season was never wet.
    const arid: HourInput[] = Array.from({ length: 24 }, (_, i) =>
      hour({
        localHour: i,
        tempC: i >= 4 && i <= 8 ? 18 : 34,
        dewPointC: 10,
        relativeHumidityPct: i >= 4 && i <= 8 ? 78 : 22,
        windMs: 1.5,
      }),
    );
    const fb = arid.map(rh90Fallback);
    expect(fb.filter((r) => r.state === "WET")).toHaveLength(0);
    // CART, on the same hours, also finds nothing here: DPD at 18/10 is 8 °C, past the 3.7 node.
    // The interesting Madera divergence is radiative-dew nights where DPD collapses but RH stays
    // under 90 — exercised below.
    expect(arid.map(cart).filter((r) => r.state === "WET")).toHaveLength(0);
  });

  it("finds the radiative-dew night the RH threshold misses", () => {
    // DPD 1.5 °C at 88% RH: CART wet (calm), fallback dry (under 90). This is the divergence that
    // makes Madera the refusal threshold's proving ground.
    const h = hour({ tempC: 11, dewPointC: 9.5, relativeHumidityPct: 88, windMs: 1.0, localHour: 5 });
    expect(cart(h).state).toBe("WET");
    expect(rh90Fallback(h).state).toBe("DRY");
  });
});

describe("wet-run segmentation", () => {
  const wetRun = (states: Array<"WET" | "DRY">) =>
    states.map((s, i) =>
      hour({
        hourStartUtc: new Date(Date.UTC(2024, 5, 1, i)).toISOString(),
        localHour: i % 24,
        tempC: 15,
        dewPointC: s === "WET" ? 14.5 : 5,
        relativeHumidityPct: s === "WET" ? 95 : 40,
        windMs: 1,
      }),
    );

  it("joins two wet spells separated by a dry gap shorter than the interruption threshold", () => {
    const hrs = wetRun(["WET", "WET", "DRY", "WET", "WET"]);
    const runs = segmentWetRuns(hrs.map(cart), { interruptionThresholdH: 4 });
    expect(runs).toHaveLength(1);
    expect(runs[0].wetHours).toBe(4);
    // The dry gap is INSIDE the run but is not counted as wet — durations feed infection models.
    expect(runs[0].spanHours).toBe(5);
  });

  it("splits when the dry gap reaches the interruption threshold", () => {
    const hrs = wetRun(["WET", "WET", "DRY", "DRY", "DRY", "DRY", "WET", "WET"]);
    const runs = segmentWetRuns(hrs.map(cart), { interruptionThresholdH: 4 });
    expect(runs).toHaveLength(2);
  });

  it("a refused hour breaks a run into UNKNOWN rather than silently continuing or ending it", () => {
    const hrs = wetRun(["WET", "WET", "WET"]);
    hrs[1] = { ...hrs[1], dewPointC: null, relativeHumidityPct: null };
    const runs = segmentWetRuns(hrs.map(cart), { interruptionThresholdH: 4 });
    // Whatever the run length is, it must be flagged: a run containing a refusal is not a measured run.
    expect(runs.some((r) => r.containsRefusal)).toBe(true);
  });
});

describe("the canopy modifier is TWO-ZONE, not block-wide (council G3)", () => {
  it("leaf-pulled VSP dries the CLUSTER zone faster while the FOLIAR zone is unchanged", () => {
    const cluster = zoneAdjustment("VSP_LEAF_PULLED_FRUIT_ZONE", "CLUSTER");
    const foliar = zoneAdjustment("VSP_LEAF_PULLED_FRUIT_ZONE", "FOLIAR");
    expect(cluster.direction).toBe("FASTER");
    expect(foliar.direction).toBe("NEUTRAL");
  });

  it("an unmanaged sprawl dries BOTH zones slower — the two zones are not always opposed", () => {
    expect(zoneAdjustment("UNMANAGED_SPRAWL", "CLUSTER").direction).toBe("SLOWER");
    expect(zoneAdjustment("UNMANAGED_SPRAWL", "FOLIAR").direction).toBe("SLOWER");
  });

  it("leaves the magnitude UNCALIBRATED — S0 defines the shape, it does not invent numbers", () => {
    for (const m of Object.keys(CART_THRESHOLDS.canopyManagements) as CanopyManagement[]) {
      for (const z of ["CLUSTER", "FOLIAR"] as const) {
        expect(zoneAdjustment(m, z).dryingHoursDelta).toBeNull();
      }
    }
  });

  it("UNKNOWN canopy management is NEUTRAL and flagged, never silently treated as VSP", () => {
    const a = zoneAdjustment("UNKNOWN", "CLUSTER");
    expect(a.direction).toBe("NEUTRAL");
    expect(a.isAssumption).toBe(true);
  });
});

describe("estimateSeries — the shape Unit 5 consumes", () => {
  it("returns one verdict per input hour, in order, with both estimators run independently", () => {
    const hrs = Array.from({ length: 6 }, (_, i) => hour({ localHour: i }));
    const out = estimateSeries(hrs);
    expect(out.cart).toHaveLength(6);
    expect(out.fallback).toHaveLength(6);
    expect(out.cart[0].hourStartUtc).toBe(hrs[0].hourStartUtc);
  });

  it("marks the dew-eligible window from SITE-LOCAL hour, not UTC", () => {
    // 03:00 local is dew-eligible whatever the UTC instant is; 14:00 local is not.
    const out = estimateSeries([hour({ localHour: 3 }), hour({ localHour: 14 })]);
    expect(out.cart[0].dewEligible).toBe(true);
    expect(out.cart[1].dewEligible).toBe(false);
  });
});

describe("purity", () => {
  it("the estimator module imports nothing from src/ and touches no I/O", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../scripts/s0-lwd.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from\s+["'].*\/src\//);
    expect(src).not.toMatch(/@prisma|PrismaClient|node:fs|node:http|fetch\(/);
  });
});
