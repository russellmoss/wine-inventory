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
import { toCanonicalSpacing, type Unit } from "@/lib/vineyard/units";

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
 * CHARACTERIZATION (pre-fix behavior, preserved verbatim in this commit): a value of
 * `0` passes `optFloat`'s `min: 0` bound, then `toCanonicalSpacing` routes it through
 * `pos()` (units.ts:18-23), which returns null for anything `<= 0`. So "0" silently
 * CLEARS the field instead of erroring. That is plan 082's risk R1 and is fixed in the
 * next commit — this one only proves the extraction changed nothing.
 */
export function spacingToCanonicalM(v: unknown, label: string, unit: Unit): number | null {
  const raw = optFloat(v, label, { min: 0 });
  return toCanonicalSpacing(raw, unit);
}
