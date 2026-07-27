import { describe, expect, it } from "vitest";
import {
  LATENT_BOUNDS,
  POWDERY_LATENT_LONG_DAYS,
  POWDERY_LATENT_SHORT_DAYS,
  addDaysIso,
  evaluateResolution,
  isInfectious,
  projectTransitions,
} from "@/lib/spray/infection-resolution";

// Arithmetic goldens in the house style (phenology-stage-core.test.ts): the infection date is fixed
// at 2026-05-01, so every expected date below is a fact you can check in your head rather than a
// fixture lookup. Constants are IMPORTED, never re-declared — a test that hard-codes 5 and 14 would
// still pass if somebody changed the bounds, which is exactly the regression we care about.
const OCCURRED = "2026-05-01";

describe("infection-resolution — projection", () => {
  it("projects both transitions and the expiry from the infection date", () => {
    const p = projectTransitions({
      pathogen: "POWDERY_MILDEW",
      hostOrgan: "LEAF",
      resolutionKind: "FIXED_WINDOW",
      infectionOccurredOn: OCCURRED,
    });
    expect(p.infectiousProjectionKind).toBe("PROJECTED");
    expect(p.infectiousExpectedAt).toBe(addDaysIso(OCCURRED, POWDERY_LATENT_SHORT_DAYS));
    expect(p.expiresOn).toBe(addDaysIso(OCCURRED, POWDERY_LATENT_LONG_DAYS));
    expect(p.latentShortDays).toBe(POWDERY_LATENT_SHORT_DAYS);
    expect(p.latentLongDays).toBe(POWDERY_LATENT_LONG_DAYS);
  });

  // ── THE C1 REGRESSION GUARD ────────────────────────────────────────────────────────────────
  // This is the safety bug council caught, and it is the single most important test in this file.
  // The plan's first draft held events open on the LONGER bound for both questions, calling it
  // "conservative". It is inverted for the infectious transition: telling a grower an infection
  // will not be infectious for fourteen days makes them wait, and if the true period is five days
  // the pathogen sporulates on day five while the ledger still reads "incubating".
  //
  // The two transitions must take OPPOSITE bounds. If someone ever "simplifies" this to one number,
  // this test fails and the comment explains why that is not a simplification.
  it("uses the SHORT bound for infectiousExpectedAt and the LONG bound for expiry — opposite ends, on purpose", () => {
    const p = projectTransitions({
      pathogen: "POWDERY_MILDEW",
      hostOrgan: "LEAF",
      resolutionKind: "FIXED_WINDOW",
      infectionOccurredOn: OCCURRED,
    });
    const short = LATENT_BOUNDS.POWDERY_MILDEW.shortDays;
    const long = LATENT_BOUNDS.POWDERY_MILDEW.longDays;

    expect(short).toBeLessThan(long); // the interval must be well-ordered or the asymmetry is meaningless
    expect(p.infectiousExpectedAt).toBe(addDaysIso(OCCURRED, short));
    expect(p.expiresOn).toBe(addDaysIso(OCCURRED, long));
    // And explicitly NOT the other way round.
    expect(p.infectiousExpectedAt).not.toBe(addDaysIso(OCCURRED, long));
    expect(p.expiresOn).not.toBe(addDaysIso(OCCURRED, short));
    // Never averaged into a single split-the-difference number (rule §3.3).
    expect(p.infectiousExpectedAt).not.toBe(addDaysIso(OCCURRED, Math.round((short + long) / 2)));
  });

  it("records the citation basis on the projected transition rather than leaving it bare", () => {
    const p = projectTransitions({
      pathogen: "POWDERY_MILDEW",
      hostOrgan: "LEAF",
      resolutionKind: "FIXED_WINDOW",
      infectionOccurredOn: OCCURRED,
    });
    expect(p.infectiousBasis).toMatch(/Delp 1954/);
    expect(p.symptomBasis).toMatch(/not separated in the literature/);
  });

  it("the UNKNOWN arm projects nothing at all — and that is a first-class answer, not a failure", () => {
    const p = projectTransitions({
      pathogen: "POWDERY_MILDEW",
      hostOrgan: "FRUIT",
      resolutionKind: "UNKNOWN",
      infectionOccurredOn: OCCURRED,
    });
    expect(p.infectiousExpectedAt).toBeNull();
    expect(p.expiresOn).toBeNull();
    expect(p.infectiousProjectionKind).toBe("UNKNOWN");
    expect(p.symptomProjectionKind).toBe("UNKNOWN");
    expect(p.latentShortDays).toBeNull();
    expect(p.latentLongDays).toBeNull();
  });

  it("never encodes an epistemic state in a bare null — a null date always carries a non-PROJECTED kind (C7)", () => {
    for (const kind of ["FIXED_WINDOW", "UNKNOWN", "ERADICATED"] as const) {
      const p = projectTransitions({ pathogen: "POWDERY_MILDEW", hostOrgan: "LEAF", resolutionKind: kind, infectionOccurredOn: OCCURRED });
      expect(p.infectiousExpectedAt === null).toBe(p.infectiousProjectionKind !== "PROJECTED");
      expect(p.symptomExpectedAt === null).toBe(p.symptomProjectionKind !== "PROJECTED");
    }
  });
});

describe("infection-resolution — closing", () => {
  const expiresOn = addDaysIso(OCCURRED, POWDERY_LATENT_LONG_DAYS); // 2026-05-15

  it("stays open on the expiry day itself and closes only after it", () => {
    expect(evaluateResolution({ resolutionKind: "FIXED_WINDOW", expiresOn, today: expiresOn }).close).toBe(false);
    expect(evaluateResolution({ resolutionKind: "FIXED_WINDOW", expiresOn, today: addDaysIso(expiresOn, 1) }).close).toBe(true);
  });

  // ── KD-5, the ledger's whole reason for existing ───────────────────────────────────────────
  // Fedele et al. 2020: a Botrytis model scored 65% against field assessment but >87% against
  // post-harvest incubation assays of SYMPTOMLESS berries. Scouting cannot see a latent infection —
  // that is what "latent" means. If a clean scout could close an event, a diligent grower walking a
  // clean row would be the thing that silently clears a real infection.
  it("a clean scouting pass NEVER closes an open event", () => {
    const midWindow = addDaysIso(OCCURRED, 7); // past the infectious date, well inside the window
    const verdict = evaluateResolution({
      resolutionKind: "FIXED_WINDOW",
      expiresOn,
      today: midWindow,
      scoutedCleanOn: midWindow,
    });
    expect(verdict.close).toBe(false);
    expect(verdict.reason).toMatch(/does NOT close/i);
  });

  it("a clean scout does not close the event even on the day it would otherwise expire", () => {
    const verdict = evaluateResolution({ resolutionKind: "FIXED_WINDOW", expiresOn, today: expiresOn, scoutedCleanOn: expiresOn });
    expect(verdict.close).toBe(false);
  });

  it("the UNKNOWN arm never self-closes and never reports a resolution date", () => {
    const v = evaluateResolution({ resolutionKind: "UNKNOWN", expiresOn: null, today: "2027-01-01" });
    expect(v.close).toBe(false);
    expect(v).not.toHaveProperty("resolvedOn");
  });

  it("a FIXED_WINDOW event with no expiry stays open rather than defaulting to closed", () => {
    expect(evaluateResolution({ resolutionKind: "FIXED_WINDOW", expiresOn: null, today: "2027-01-01" }).close).toBe(false);
  });

  it("an eradicated event stops projecting and has nothing left to resolve", () => {
    expect(evaluateResolution({ resolutionKind: "ERADICATED", expiresOn: null, today: "2027-01-01" }).close).toBe(false);
  });
});

describe("infection-resolution — is this block a source of inoculum?", () => {
  const infectiousAt = addDaysIso(OCCURRED, POWDERY_LATENT_SHORT_DAYS); // 2026-05-06

  it("is not infectious before the short bound, and is on/after it", () => {
    const base = { infectiousExpectedAt: infectiousAt, infectiousProjectionKind: "PROJECTED" as const, status: "OPEN" as const };
    expect(isInfectious({ ...base, today: addDaysIso(infectiousAt, -1) })).toBe(false);
    expect(isInfectious({ ...base, today: infectiousAt })).toBe(true);
    expect(isInfectious({ ...base, today: addDaysIso(infectiousAt, 3) })).toBe(true);
  });

  it("returns null — not false — when the transition was never projected", () => {
    const answer = isInfectious({
      infectiousExpectedAt: null,
      infectiousProjectionKind: "UNKNOWN",
      status: "OPEN",
      today: "2026-06-01",
    });
    // false would read as "this block is safe". Unknown is not safe; it is unknown (rule §3.6).
    expect(answer).toBeNull();
  });

  it("a closed or voided event is not a source of inoculum", () => {
    const base = { infectiousExpectedAt: infectiousAt, infectiousProjectionKind: "PROJECTED" as const, today: "2026-06-01" };
    expect(isInfectious({ ...base, status: "CLOSED" })).toBe(false);
    expect(isInfectious({ ...base, status: "VOID" })).toBe(false);
  });
});
