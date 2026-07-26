/**
 * Spray S2 Unit 5 — the pesticide lookup result contract. Pure types, no imports.
 *
 * Design rules these types enforce (S2 plan, council G1/G2/G3/C1/C4):
 *  - Every read returns a discriminated union — no bare nulls, no throw-on-absent, and NO variant
 *    that is truthy-coercible into "permitted".
 *  - `factsAsOf` is a COMPOSITE (C1): one lookup spans four sources on different cadences, so a
 *    single scalar revision id would be a false contract. This exact shape is the cross-lane
 *    agreement with S3a (docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md).
 *  - `provenance` ships as the FULL union from day one (C4): widening a literal union later breaks
 *    exhaustive consumers. S2 only ever produces "registry"; "grower-supplied" is S2b's override.
 */

/** ISO strings, not Dates — this object is snapshot-copied by S3a's spray record. */
export interface PesticideFactsAsOf {
  publishedRevisionId: string;
  apprilAsOf: string | null;
  cdprAsOf: string | null;
  resistanceArtifactSha256: string | null;
}

export type PesticideProvenance = "registry" | "grower-supplied";

export interface PesticideJurisdiction {
  /** ISO 3166-1 alpha-2, e.g. "US". Anything else → jurisdiction-unsupported (never a throw — rule §3.9). */
  country: string;
  /** US state code, e.g. "CA". Required for a clearance; missing → state-registration-unknown. */
  state?: string | null;
}

/** The caller's vine context (K11). BEARING is the default — the conservative common case: a
 * non-bearing-only registration then fails the composition. UNSPECIFIED site rows count for a
 * BEARING context (a bare "Grapes" label is the normal bearing registration); NON_BEARING-only
 * rows never do. */
export type VineSiteContext = "BEARING" | "NON_BEARING";

export type PesticideSiteModifierValue = "BEARING" | "NON_BEARING" | "UNSPECIFIED";
export type ResistanceResolutionValue = "CODED" | "NO_CODE_EXISTS" | "GAP";
export type ResistanceSiteTypeValue = "SINGLE" | "MULTI" | "UNKNOWN";

export interface AiResistanceView {
  aiName: string;
  pcCode: string | null;
  resolution: ResistanceResolutionValue;
  codes: string[];
  siteType: ResistanceSiteTypeValue;
  /** null when the AI has NO assignment row — which is itself a GAP by construction. */
  derivedFrom: string | null;
}

/** K13 most-conservative rollup: any constituent AI in GAP makes the PRODUCT GAP. Codes that did
 * resolve travel as explicitly-labelled partial evidence — never as the answer. */
export interface ProductResistanceView {
  scheme: "FRAC";
  resolution: ResistanceResolutionValue;
  /** For CODED: the answer. For GAP: PARTIAL EVIDENCE only (see partialEvidence). */
  codes: string[];
  partialEvidence: boolean;
  siteType: ResistanceSiteTypeValue;
  derivedFrom: "PRODUCT_KEYED_TABLE" | "EXTENSION_PROSE" | "LABEL_SINGLE_AI" | "AI_ROLLUP";
  perAi: AiResistanceView[];
}

export interface FederalStatusView {
  registeredOnGrapes: boolean;
  siteModifiers: PesticideSiteModifierValue[];
  registrationStatus: string | null;
}

export interface RegistrationRestrictionView {
  state: string;
  counties: string[];
  kind: string;
  exception: string | null;
  quote: string;
}

export interface RegistrationData {
  product: {
    epaRegNumber: string;
    productName: string;
    companyName: string | null;
    labelDate: string | null;
    pestCategoryRaw: string | null;
    registrationStatus: string | null;
  };
  grapeSites: { siteNameRaw: string; siteModifier: PesticideSiteModifierValue }[];
  state: { state: string; status: "REGISTERED" };
  restrictions: RegistrationRestrictionView[];
  activeIngredients: { name: string; pcCode: string | null; percent: number | null }[];
  resistance: ProductResistanceView | null;
}

/**
 * The legality composition (council C12): federal is necessary-never-sufficient, state is a required
 * conjunct, restrictions subtract. The ONLY composition yielding `ok: true` is: federally registered
 * on grapes for this vine context AND state-registered in this jurisdiction AND no unresolved
 * restriction. There is no path from partial knowledge to a clearance.
 */
export type RegistrationLookupResult =
  | { ok: true; data: RegistrationData; factsAsOf: PesticideFactsAsOf; provenance: PesticideProvenance }
  | { ok: false; reason: "source-not-enabled" }
  | { ok: false; reason: "malformed-reg-number"; detail: string }
  | { ok: false; reason: "unsupported-registration-format"; format: "CA_STATE_ONLY" | "EXEMPT_25B" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "not-registered-on-grapes"; factsAsOf: PesticideFactsAsOf }
  | {
      ok: false;
      reason: "non-bearing-only"; // ⚑ G1: never reported as registered for a bearing block
      siteModifiers: PesticideSiteModifierValue[];
      factsAsOf: PesticideFactsAsOf;
    }
  | {
      ok: false;
      reason: "state-not-registered"; // explicit CDPR NOT_REGISTERED row — a real NO, not absence
      state: string;
      federalStatus: FederalStatusView;
      factsAsOf: PesticideFactsAsOf;
    }
  | {
      ok: false;
      reason: "state-registration-unknown"; // ⚑ G2: the federal fact is shown, never as a clearance
      state: string | null;
      federalStatus: FederalStatusView;
      factsAsOf: PesticideFactsAsOf;
    }
  | { ok: false; reason: "jurisdiction-unsupported" }; // ⚑ G2 / rule §3.9 — non-US never throws
