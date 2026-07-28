/**
 * Button geometry, v2 §B6.
 *
 * Split out of Button.tsx so it is pure and unit-testable under the repo's
 * `environment: "node"` vitest config (no DOM, no React) — the same pattern as
 * src/lib/voice/inline-ui.ts.
 *
 * The old map was 34/42/50px, which put 293 of the app's 376 controls under the
 * 44px touch floor. Heights now come from the touch tokens wherever a token
 * exists, so "what is the floor" has exactly one answer:
 *
 *   sm 44 = --touch-min       (the absolute floor, at every width)
 *   md 48 = no token — the default control height is not a touch-floor concept
 *   lg 56 = --touch-floor     (primary action on a capture screen)
 *   xl 68 = --touch-floor-lg  (the single tick action on a phone runner)
 *
 * test/button-sizes.test.ts pins these strings; test/design-tokens.test.ts pins
 * what the tokens resolve to. Together they prove 44/48/56/68 without a browser;
 * the Playwright pass (AC-F1) then measures the real rendered boxes.
 */

export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonMetrics {
  /** CSS length. Token reference where one exists. */
  height: string;
  padding: string;
  fontSize: string;
  /** Gap between icon and label, px. */
  gap: number;
  /** The px height these resolve to — documentation + test fixture, not consumed by the component. */
  px: number;
}

export const BUTTON_SIZES: Record<ButtonSize, ButtonMetrics> = {
  sm: { height: "var(--touch-min)", padding: "10px var(--space-4)", fontSize: "var(--text-body-sm)", gap: 6, px: 44 },
  md: { height: "48px", padding: "12px 20px", fontSize: "15px", gap: 8, px: 48 },
  lg: { height: "var(--touch-floor)", padding: "var(--space-4) 26px", fontSize: "16.5px", gap: 10, px: 56 },
  xl: { height: "var(--touch-floor-lg)", padding: "18px var(--space-5)", fontSize: "19px", gap: 12, px: 68 },
};

/** Fail-soft lookup — an unknown size renders the default rather than nothing. */
export function buttonMetrics(size: ButtonSize | undefined): ButtonMetrics {
  return BUTTON_SIZES[size ?? "md"] ?? BUTTON_SIZES.md;
}
