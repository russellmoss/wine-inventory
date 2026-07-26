/**
 * Spray S2 Unit 2 — pure registration-number resolution (K6, council C6/G4).
 *
 * A malformed reg number must NEVER fuzzy-match to a product: a near-miss that resolves confidently
 * to the wrong product produces a confidently wrong legality answer. So parsing is a typed gate —
 * exact canonical form or a typed rejection — and the lookup (Unit 5) matches ONLY on the canonical
 * string. No `contains`, no case-insensitive mode, no similarity anywhere in the lane (enforced by
 * the Unit 11 source-scan guard).
 *
 * The format tag is council G4's fold: many labels legally REQUIRE an adjuvant in the tank; adjuvants
 * are federally exempt but CA-state-registered (letter-suffix numbers), and FIFRA 25(b) minimum-risk
 * products lack standard EPA digits entirely. Calling those "malformed" would be a lie — and would
 * make a legally-required tank component unloggable for S3a. S2 RESOLVES only EPA_FEDERAL; the other
 * two formats produce `unsupported-registration-format` at the lookup — a typed hook S2b/S3a fill.
 *
 * Pure: no imports, no I/O. The parser returns ok | malformed only — `not-found` is the lookup's
 * result, not the parser's (C6).
 */

export type RegNumberFormat = "EPA_FEDERAL" | "CA_STATE_ONLY" | "EXEMPT_25B";

export type ParsedRegNumber =
  | { ok: true; format: RegNumberFormat; canonical: string }
  | { ok: false; reason: "malformed" };

const MAX_INPUT_LENGTH = 64;

// EPA federal: COMPANY-PRODUCT with an optional -DISTRIBUTOR segment, ASCII digits and ASCII hyphens
// only. Interior is never repaired: a U+2011 non-breaking hyphen, a fused trailing character, or an
// empty segment is a rejection, not a fix-up.
const EPA_FEDERAL = /^(\d+)-(\d+)(?:-(\d+))?$/;

// CA-state-only (adjuvants and other CDPR-only registrations): digit segments with a final
// letter-suffix segment of 1–2 uppercase letters as its OWN dash segment (e.g. "40989-50001-AA").
// A letter fused onto a digit segment ("100-1234x") is malformed, not CA.
const CA_STATE_ONLY = /^(\d+)-(\d+)-([A-Z]{1,2})$/;

// FIFRA 25(b) minimum-risk marker — these products carry no registration number at all; sources and
// operators write the exemption instead. Recognized so the exemption is typed, never "malformed".
const EXEMPT_25B = /^(?:exempt|25\(?b\)?|fifra\s*25\(?b\)?(?:\s*exempt)?)$/i;

/** Strip per-segment leading zeros (CDPR's fixed-width dumps zero-pad; APPRIL does not — the
 * canonical form is the cross-source join key). An all-zero segment normalizes to nothing → the
 * caller treats it as malformed. */
function stripLeadingZeros(segment: string): string {
  return segment.replace(/^0+/, "");
}

export function parseRegistrationNumber(input: string): ParsedRegNumber {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_INPUT_LENGTH) return { ok: false, reason: "malformed" };

  if (EXEMPT_25B.test(trimmed)) {
    return { ok: true, format: "EXEMPT_25B", canonical: "EXEMPT-25B" };
  }

  const epa = EPA_FEDERAL.exec(trimmed);
  if (epa) {
    const segments = [epa[1], epa[2], epa[3]].filter((s): s is string => s != null).map(stripLeadingZeros);
    if (segments.some((s) => s.length === 0)) return { ok: false, reason: "malformed" };
    return { ok: true, format: "EPA_FEDERAL", canonical: segments.join("-") };
  }

  const ca = CA_STATE_ONLY.exec(trimmed);
  if (ca) {
    const digits = [ca[1], ca[2]].map(stripLeadingZeros);
    if (digits.some((s) => s.length === 0)) return { ok: false, reason: "malformed" };
    return { ok: true, format: "CA_STATE_ONLY", canonical: `${digits[0]}-${digits[1]}-${ca[3]}` };
  }

  return { ok: false, reason: "malformed" };
}
