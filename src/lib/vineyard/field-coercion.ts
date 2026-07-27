// Pure field coercion for vineyard + block writes. No Prisma, no I/O, no "use server",
// no React — same discipline as ./units.ts, and for the same reason: this module has to be
// importable from BOTH the /reference server actions and the assistant's EntityConfig.
//
// Why it exists: the coercion rules used to live as file-private helpers inside
// `actions.ts`, which is a "use server" module and therefore can only export async
// functions. The assistant's write path could not import them, so it grew a second,
// thinner set of rules — and the two drifted. Plan 082 pulled the rules out here so
// there is exactly ONE definition of "what a valid row spacing is".
//
// Canonical storage is METRIC (see ./units.ts). Everything here returns canonical values.

import { ActionError } from "@/lib/action-error";
import { isValidHex } from "@/lib/vineyard/colors";
import { ftToM, toCanonicalSpacing, type Unit } from "@/lib/vineyard/units";

// ── Primitive parsers (everything optional; validate only when present) ────

export function optStr(v: unknown, max = 200): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  if (s.length > max) throw new ActionError("That value is too long.");
  return s;
}

export function optInt(
  v: unknown,
  label: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ActionError(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function optFloat(
  v: unknown,
  label: string,
  { min, max }: { min?: number; max?: number } = {},
): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new ActionError(`${label} must be a number.`);
  if (min != null && n < min) throw new ActionError(`${label} must be at least ${min}.`);
  if (max != null && n > max) throw new ActionError(`${label} must be at most ${max}.`);
  return n;
}

export function optColor(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  if (!isValidHex(s)) throw new ActionError("That isn't a valid color.");
  return s;
}

/** The unit a caller typed values in. Anything that isn't "metric" is imperial. */
export function readUnitValue(v: unknown): Unit {
  return v === "metric" ? "metric" : "imperial";
}

// ── Composed field coercers ───────────────────────────────────────────────

/**
 * A spacing value typed in `unit` → canonical meters.
 *
 * Zero and negatives are REFUSED, not silently dropped. Two layers used to disagree
 * about what `0` meant: `optFloat`'s `min: 0` admitted it, then `toCanonicalSpacing` →
 * `pos()` (units.ts:18-23) mapped anything `<= 0` to null. A user typing 0 into row
 * spacing got a wiped field and no complaint (plan 082, R1). Spacing is a physical
 * distance between vines — zero is not a value, it is a mistake, and it silently
 * destroys the derived planted acreage.
 *
 * Contrast `elevationToCanonicalM` below, where 0 IS meaningful (sea level).
 */
export function spacingToCanonicalM(v: unknown, label: string, unit: Unit): number | null {
  // Deliberately NO `min` bound here. With `min: 0`, optFloat rejected negatives first with
  // "must be at least 0" — which tells the user 0 is acceptable, and it is not. Letting the
  // `<= 0` check own the whole rejection gives one true message for both cases.
  const raw = optFloat(v, label);
  if (raw === null) return null;
  if (raw <= 0) throw new ActionError(`${label} must be greater than 0.`);
  return toCanonicalSpacing(raw, unit);
}

/**
 * An elevation typed in `unit` → canonical meters. Unlike spacing, 0 is a legitimate
 * value (sea level) and passes through.
 *
 * The `min: 0` bound is inherited verbatim from the /reference form's existing rule, so
 * both write paths agree. NOTE it means sub-sea-level sites are refused, and real ones
 * exist (Death Valley, the Dead Sea). Changing that is a product decision, not a
 * refactor, so it is deliberately NOT changed here — raised as an open question on
 * plan 082 instead. If it changes, it changes in this one place for both callers.
 */
export function elevationToCanonicalM(v: unknown, unit: Unit): number | null {
  const raw = optFloat(v, "Elevation", { min: 0 });
  if (raw === null) return null;
  return unit === "metric" ? raw : ftToM(raw);
}

export function gpsLatToCanonical(v: unknown): number | null {
  return optFloat(v, "Latitude", { min: -90, max: 90 });
}

export function gpsLngToCanonical(v: unknown): number | null {
  return optFloat(v, "Longitude", { min: -180, max: 180 });
}

// ── Spray S2b Unit 1 — jurisdiction (KD-9) ─────────────────────────────────
//
// A country/state pair is farm metadata like any other field above; what makes jurisdiction
// different is `jurisdictionConfirmedAt`, which `resolveJurisdictionUpdate` below governs so a
// stored jurisdiction is ALWAYS one a human explicitly confirmed (rule §3.2 / council S6). The
// UI may PROPOSE values (from GPS), but a proposal that is saved without the confirm box checked
// must never silently count as confirmed.

export function optCountryCode(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "") return null;
  if (!/^[A-Z]{2}$/.test(s)) throw new ActionError("Country must be a 2-letter ISO code (e.g. US).");
  return s;
}

export function optStateCode(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "") return null;
  if (!/^[A-Z]{2}$/.test(s)) throw new ActionError("State must be a 2-letter code (e.g. CA).");
  return s;
}

export interface JurisdictionRow {
  regulatoryCountry: string | null;
  regulatoryState: string | null;
  jurisdictionConfirmedAt: Date | null;
  jurisdictionConfirmedBy: string | null;
}

/**
 * Decide the jurisdiction columns to write, given what's already stored, what was submitted, and
 * whether the confirm box was checked THIS submit.
 *
 *  - Checked → the submitted values become confirmed, stamped now, attributed to the confirmer.
 *  - Unchecked AND submitted values match what's already confirmed → PRESERVE the existing
 *    confirmation (editing an unrelated field, e.g. soil type, must not silently unconfirm it).
 *  - Unchecked AND submitted values DIFFER from what's confirmed (or nothing was ever confirmed)
 *    → a PROPOSAL only. `jurisdictionConfirmedAt` stays/becomes null — an edited-but-unconfirmed
 *    jurisdiction must never resolve (council S6).
 */
export function resolveJurisdictionUpdate(
  before: JurisdictionRow | null,
  submitted: { country: string | null; state: string | null },
  confirmChecked: boolean,
  confirmedByUserId: string | null,
  now: Date,
): JurisdictionRow {
  if (confirmChecked) {
    if (!submitted.country) throw new ActionError("A country is required to confirm the jurisdiction.");
    return {
      regulatoryCountry: submitted.country,
      regulatoryState: submitted.state,
      jurisdictionConfirmedAt: now,
      jurisdictionConfirmedBy: confirmedByUserId,
    };
  }
  const unchanged =
    (before?.regulatoryCountry ?? null) === submitted.country && (before?.regulatoryState ?? null) === submitted.state;
  if (unchanged && before?.jurisdictionConfirmedAt) {
    return {
      regulatoryCountry: submitted.country,
      regulatoryState: submitted.state,
      jurisdictionConfirmedAt: before.jurisdictionConfirmedAt,
      jurisdictionConfirmedBy: before.jurisdictionConfirmedBy,
    };
  }
  return {
    regulatoryCountry: submitted.country,
    regulatoryState: submitted.state,
    jurisdictionConfirmedAt: null,
    jurisdictionConfirmedBy: null,
  };
}

/**
 * A vineyard abbreviation → the canonical uppercase lot-code token.
 *
 * This is the 2-4 character slot that appears in lot codes, so it is identity-adjacent:
 * it must be alphanumeric and length-bounded, and callers must ALSO check it does not
 * collide case-insensitively with another vineyard's (see EntityConfig.findConflict).
 * Uppercasing here means "abv" and "ABV" cannot both be stored.
 */
export const ABBREVIATION_MIN = 2;
export const ABBREVIATION_MAX = 4;

export function normalizeAbbreviation(v: unknown): string | null {
  const s = optStr(v, ABBREVIATION_MAX);
  if (s === null) return null;
  const upper = s.toUpperCase();
  if (!/^[A-Z0-9]+$/.test(upper)) {
    throw new ActionError("An abbreviation can only contain letters and numbers.");
  }
  if (upper.length < ABBREVIATION_MIN) {
    throw new ActionError(
      `An abbreviation must be ${ABBREVIATION_MIN}-${ABBREVIATION_MAX} characters.`,
    );
  }
  return upper;
}
