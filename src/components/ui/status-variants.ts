/**
 * The status vocabulary (v2 §A4) — six values, one language, app-wide.
 *
 * Before this, six independent status→colour maps disagreed with each other, and
 * `Badge tone="gold"` rendered wine, so on the busiest screen in the product
 * PENDING, IN_PROGRESS and REJECTED were mutually indistinguishable.
 *
 * Pure and dependency-free so every mapping module (work orders, blend trials,
 * feedback, samples) can import it without pulling React or Prisma along, and so
 * it is unit-testable under the repo's `environment: "node"` vitest config.
 */

export type StatusVariant = "neutral" | "active" | "held" | "done" | "attention" | "review";

/**
 * The glyph is the non-colour half of the encoding and is mandatory: greyscale a
 * screenshot and the six must still be told apart (AC-C6). It is always
 * `aria-hidden` — the visible text carries the meaning for assistive tech.
 */
export const STATUS_GLYPH: Record<StatusVariant, string> = {
  neutral: "○",
  active: "◐",
  held: "◔",
  done: "●",
  attention: "▲",
  review: "◇",
};

export const STATUS_VARIANTS: readonly StatusVariant[] = [
  "neutral",
  "active",
  "held",
  "done",
  "attention",
  "review",
] as const;

export function isStatusVariant(v: unknown): v is StatusVariant {
  return typeof v === "string" && (STATUS_VARIANTS as readonly string[]).includes(v);
}
