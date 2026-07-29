/**
 * Text tokens actually meet AA, computed rather than asserted in a comment.
 *
 * `--ink-500` shipped with the comment "meta/eyebrow text on white, 4.6:1". The
 * measured value was **3.81:1 on white and 3.62:1 on the cream surface the app
 * actually renders on** — under AA for normal text, and axe was failing on it on
 * the styleguide. Nobody had lied; somebody had done the arithmetic once, by hand,
 * and the number had been believed ever since.
 *
 * So this computes the ratio from the hex. A token comment is documentation; this
 * is the check. WCAG 1.4.3: 4.5:1 for normal text, 3:1 for large (≥18.66px bold or
 * ≥24px) — every token here is used at body size, so they are all held to 4.5.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(fileURLToPath(new URL("../src/styles/tokens/colors.css", import.meta.url)), "utf8");

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Resolve a raw hex token like `--ink-500: #79725F;` out of the stylesheet. */
function hex(token: string): string {
  const m = CSS.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`${token} is not a raw hex in colors.css`);
  return m[1].toUpperCase();
}

// The two surfaces body text is rendered on. `--surface-page` is CREAM, not white,
// and cream is the harder of the two — checking only white overstates every ratio.
const WHITE = "#FFFFFF";
const CREAM = "#FFF8F1";

describe("text tokens clear WCAG AA on every surface they are used on", () => {
  // Each is a foreground token that carries real copy at body size.
  const TEXT_TOKENS = ["--ink-500", "--ink-600", "--ink-700", "--ink-800", "--ink-900"];

  for (const token of TEXT_TOKENS) {
    it(`${token} is >= 4.5:1 on white AND on cream`, () => {
      const c = hex(token);
      expect(contrast(c, WHITE), `${token} (${c}) on white`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c, CREAM), `${token} (${c}) on cream — the app's own page surface`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("holds the status foregrounds to the same line", () => {
    // These carry short status words, still normal-size text.
    for (const token of ["--status-held-fg", "--status-attention-fg"]) {
      const c = hex(token);
      expect(contrast(c, WHITE), `${token} (${c}) on white`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("does not hold FILL tokens to a text ratio", () => {
    // --warning is golden-yellow: correct as a border or tint, 2.36:1 as text. It is
    // excluded on purpose, and test/inactive-state-a11y.test.ts is what stops anyone
    // using it as a foreground.
    expect(contrast(hex("--golden-yellow"), WHITE)).toBeLessThan(4.5);
  });

  it("is not vacuous — the arithmetic matches known values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // The exact value that shipped believing it was 4.6.
    expect(contrast("#8A8272", "#FFFFFF")).toBeCloseTo(3.81, 1);
  });
});
