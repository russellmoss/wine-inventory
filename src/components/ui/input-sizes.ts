/**
 * Input geometry, v2 §B8.
 *
 * Split out of Input.tsx so it is pure and unit-testable under the repo's
 * `environment: "node"` vitest config — same pattern as ./button-sizes.ts.
 *
 * The old map was sm 36 / md 44 / lg 52. `sm` at 36px sat under the 44px touch
 * floor: Phase 1's floor sweep covered Button only, so Input kept a
 * below-minimum size. Heights now come from the touch tokens wherever one
 * exists, so "what is the floor" has one answer across both controls:
 *
 *   sm    44 = --touch-min     (the absolute floor, at every width)
 *   md    48 = no token        (the default control height is not a floor concept)
 *   lg    56 = --touch-floor   (primary field on a capture screen)
 *   floor 60 = no token        (v2 §B9's capture-screen field; taller than
 *                               --touch-floor on purpose — a wet-hands numeric
 *                               field, not a button)
 *
 * test/input-sizes.test.ts pins these; test/design-tokens.test.ts pins what the
 * tokens resolve to. Playwright measures the rendered boxes.
 */

export type InputSize = "sm" | "md" | "lg" | "floor";

export interface InputMetrics {
  /** CSS length. Token reference where one exists. */
  height: string;
  /** Horizontal padding, px. */
  padX: number;
  /** Font size, px. */
  fontSize: number;
  /** The px height this resolves to — documentation + test fixture. */
  px: number;
}

export const INPUT_SIZES: Record<InputSize, InputMetrics> = {
  sm: { height: "var(--touch-min)", padX: 12, fontSize: 14, px: 44 },
  md: { height: "48px", padX: 14, fontSize: 15, px: 48 },
  lg: { height: "var(--touch-floor)", padX: 16, fontSize: 16, px: 56 },
  floor: { height: "60px", padX: 16, fontSize: 17, px: 60 },
};

/** Fail-soft lookup — an unknown size renders the default rather than nothing. */
export function inputMetrics(size: InputSize | undefined): InputMetrics {
  return INPUT_SIZES[size ?? "md"] ?? INPUT_SIZES.md;
}
