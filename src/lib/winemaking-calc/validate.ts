// Winemaking-calculator engine — shared input validation.
//
// LOCKED review revision #2: legacy winemaking calculators silently return NaN/Infinity
// on bad input (negative volume, division-by-zero in Pearson's square, etc.). For a tool
// that suggests real cellar additions, a silent wrong number is dangerous. Every calc runs
// its inputs through these guards BEFORE computing (and, in PR2, before logging). On a
// violation we throw a typed DomainError; the page renders it inline, the assistant surfaces
// it as text. Never a silent NaN.
//
// Pure — no prisma/React. Unit-tested in test/winemaking-calc-units.test.ts.

/** A user-facing input-domain violation (bad/impossible input), distinct from a code bug. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** Require a finite number (rejects NaN, Infinity, non-numbers). */
export function requireFinite(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError(`${label} must be a number.`);
  }
  return value;
}

/** Require a strictly-positive volume (a dose into zero/negative wine is meaningless). */
export function requirePositive(value: number, label: string): number {
  requireFinite(value, label);
  if (value <= 0) throw new DomainError(`${label} must be greater than zero.`);
  return value;
}

/** Require a non-negative number (e.g. a rate/target that may be zero but not negative). */
export function requireNonNegative(value: number, label: string): number {
  requireFinite(value, label);
  if (value < 0) throw new DomainError(`${label} cannot be negative.`);
  return value;
}

/**
 * Guard a denominator that must not be zero (Pearson's square, deacid delta). `message`
 * explains the winemaking reason so the user understands, e.g. "Spirit and target strength
 * must differ."
 */
export function requireNonZeroDenominator(value: number, message: string): number {
  requireFinite(value, "denominator");
  if (value === 0) throw new DomainError(message);
  return value;
}

/** Require a value to be one of an allowed set (unit-enum membership). */
export function requireOneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new DomainError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}
