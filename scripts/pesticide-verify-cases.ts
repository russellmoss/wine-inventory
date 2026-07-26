/**
 * Spray S2 Unit 11 — the typed case table for `verify:pesticide`, in its OWN module so tests can
 * import it (verify-pesticide.ts runs main() at import and therefore cannot be imported from — the
 * kb-eval-cases.ts precedent).
 *
 * Every case is a Success Criterion from the S2 plan, expressed as data.
 */

export interface RegistrationCase {
  name: string;
  regNumber: string;
  jurisdiction: { country: string; state?: string | null };
  vineSiteContext?: "BEARING" | "NON_BEARING";
  /** Expected discriminant: "ok" or the exact `reason` literal. */
  expect: string;
  why: string;
}

/** Live products, verified against the 2026-07-21 APPRIL dump + 2026-07-25 CDPR files. */
export const REGISTRATION_CASES: RegistrationCase[] = [
  {
    name: "Gavel 75DF is registered on grapes in CA",
    regNumber: "10163-6414",
    jurisdiction: { country: "US", state: "CA" },
    expect: "ok",
    why: "plan 086's counter-intuitive verified case — CDPR prod_site carries it on GRAPES, WINE despite widespread claims otherwise",
  },
  {
    name: "Fusilade DX is registered on grapes in CA",
    regNumber: "100-1070",
    jurisdiction: { country: "US", state: "CA" },
    expect: "ok",
    why: "the second verified case; note the LIVE prodno (62562), not the 2004-dead 30117 whose site rows still read 'A'",
  },
  {
    name: "a federally-registered product in NY is state-registration-unknown, never ok",
    regNumber: "10163-6414",
    jurisdiction: { country: "US", state: "NY" },
    expect: "state-registration-unknown",
    why: "⚑ G2/K12 — FIFRA lets a state restrict a federally registered product; S2 ships only the CA layer, so outside CA we fail closed",
  },
  {
    name: "a non-US jurisdiction returns jurisdiction-unsupported without throwing",
    regNumber: "10163-6414",
    jurisdiction: { country: "BT" },
    expect: "jurisdiction-unsupported",
    why: "rule §3.9 — Bhutan is a live tenant and the app must not brick for it",
  },
  {
    // The fixture must be CA-REGISTERED and carry ONLY non-bearing grape sites, or the composition
    // refuses earlier for an unrelated reason and the G1 guard is never actually exercised.
    // (Surflan 70506-40 is NOT this case: it also carries "Grapes (Soil Treatment)" = UNSPECIFIED.)
    name: "a non-bearing-only herbicide is never registered for a bearing block",
    regNumber: "62719-175",
    jurisdiction: { country: "US", state: "CA" },
    vineSiteContext: "BEARING",
    expect: "non-bearing-only",
    why: "⚑ G1/K11 — Snapshot 2.5 TG is CA-registered but carries only 'Grapes (Nonbearing)' / 'Grapes (American) (Nonbearing)'; applying it to bearing vines makes the crop unsellable",
  },
  {
    name: "…and the SAME product IS answerable for a non-bearing block",
    regNumber: "62719-175",
    jurisdiction: { country: "US", state: "CA" },
    vineSiteContext: "NON_BEARING",
    expect: "ok",
    why: "the guard is a context check, not a blanket refusal — a young-vine block can legally use it",
  },
  {
    name: "a malformed reg number never fuzzy-matches to a product",
    regNumber: "10163‑6414",
    jurisdiction: { country: "US", state: "CA" },
    expect: "malformed-reg-number",
    why: "K6 — that is a U+2011 non-breaking hyphen; a near-miss resolving confidently to the wrong product is a confidently wrong legality answer",
  },
  {
    name: "a CA-state-only number is unsupported-format, NOT malformed",
    regNumber: "40989-50001-AA",
    jurisdiction: { country: "US", state: "CA" },
    expect: "unsupported-registration-format",
    why: "G4 — adjuvants are federally exempt but CA-registered, and many labels legally require one in the tank",
  },
  {
    name: "an unknown-but-well-formed reg number is not-found",
    regNumber: "99999-99999",
    jurisdiction: { country: "US", state: "CA" },
    expect: "not-found",
    why: "absence is a typed answer, never a clearance",
  },
];

export interface ResistanceCase {
  name: string;
  /** EPA registration number of a live product. */
  regNumber: string;
  expectResolution: "CODED" | "NO_CODE_EXISTS" | "GAP";
  expectCodes?: string[];
  expectSiteType?: "SINGLE" | "MULTI" | "UNKNOWN";
  why: string;
}

export const RESISTANCE_CASES: ResistanceCase[] = [
  {
    name: "Switch resolves to 9 AND 12, never 9 alone",
    regNumber: "100-953",
    expectResolution: "CODED",
    expectCodes: ["9", "12"],
    why: "K4 — an AI-keyed source lists Switch under cyprodinil (9); a naive join drops group 12, an under-count of a mode of action",
  },
  {
    name: "Pristine resolves to 7 and 11",
    regNumber: "7969-199",
    expectResolution: "CODED",
    expectCodes: ["7", "11"],
    why: "independently confirmed twice during plan 086's research",
  },
  {
    name: "captan resolves CODED M 04 with siteType MULTI",
    regNumber: "70506-454",
    expectResolution: "CODED",
    expectCodes: ["M 04"],
    expectSiteType: "MULTI",
    why: "K3 — 'has a taxonomic code' and 'is not a rotation partner' are both true; rotation keys off siteType",
  },
  {
    name: "Zampro resolves GAP — the free-source miss stays VISIBLE, never guessed",
    regNumber: "7969-302",
    expectResolution: "GAP",
    why: "plan 086 measured Zampro as a miss for the free sources (Cornell codes 45/40). A GAP is the honest answer; the coverage report is where it becomes a purchasing decision",
  },
];
