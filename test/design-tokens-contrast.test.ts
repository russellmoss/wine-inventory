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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { code } from "./helpers/code";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

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

/**
 * The THREE surfaces body text is rendered on. Checking only white overstates every
 * ratio, and checking white + cream still misses the one that binds: `--surface-sunken`
 * (#F5F2EC) is the darkest, and `.bw-inactive` put more of it on screen. A first pass
 * at --ink-500 #79725F cleared white (4.79) and cream (4.55) and still failed sunken
 * at 4.29 — which is exactly the trap of measuring against the lightest surface.
 */
const SURFACES: Record<string, string> = {
  "white (--surface-raised, cards)": "#FFFFFF",
  "cream (--surface-page)": "#FFF8F1",
  "paper-100 (--surface-sunken, .bw-inactive)": "#F5F2EC",
};

describe("text tokens clear WCAG AA on every surface they are used on", () => {
  // Each is a foreground token that carries real copy at body size.
  const TEXT_TOKENS = ["--ink-500", "--ink-600", "--ink-700", "--ink-800", "--ink-900"];

  for (const token of TEXT_TOKENS) {
    it(`${token} clears 4.5:1 on every surface it renders on`, () => {
      const c = hex(token);
      for (const [name, bg] of Object.entries(SURFACES)) {
        expect(contrast(c, bg), `${token} (${c}) on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("holds the status foregrounds to the same line", () => {
    // These carry short status words, still normal-size text.
    for (const token of ["--status-held-fg", "--status-attention-fg"]) {
      const c = hex(token);
      expect(contrast(c, SURFACES["white (--surface-raised, cards)"]), `${token} (${c}) on white`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps DESIGN.md's hex in step with the token", () => {
    // CLAUDE.md makes DESIGN.md the source of truth for colour, so a token that moves
    // without it starts lying to the next person who reads the doc instead of the CSS.
    const design = readFileSync(fileURLToPath(new URL("../DESIGN.md", import.meta.url)), "utf8");
    expect(design, "DESIGN.md still names the old --ink-500").toContain(hex("--ink-500"));
    expect(design).not.toContain("#8A8272");
  });

  it("keeps --text-meta off the tinted surfaces", () => {
    // --ink-500 is tuned for the three PAGE surfaces (white / cream / paper-100). The
    // tints are darker again, and meta grey measured 3.86:1 on --surface-tint-success
    // inside ActionReceipt. Tinted surfaces have their own inks (--green-ink,
    // --red-ink, --blue-ink, --golden-ink) and --text-secondary clears all five at
    // 7.1:1+. Darkening --ink-500 far enough to survive a tint would have collapsed
    // it into --ink-600 and flattened the ramp for every ordinary page.
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const src = code(readFileSync(file, "utf8"));
      // Same style object carrying both a tint background and meta text.
      for (const m of src.matchAll(/style=\{\{[^}]*\}\}/g)) {
        if (m[0].includes("surface-tint-") && m[0].includes("--text-meta")) {
          offenders.push(file.slice(SRC.length + 1).split(sep).join("/"));
        }
      }
    }
    expect(
      offenders,
      "meta grey on a tinted surface fails AA — use --text-secondary or the tint's own ink",
    ).toEqual([]);
  });

  it("does not hold FILL tokens to a text ratio", () => {
    // --warning is golden-yellow: correct as a border or tint, 2.36:1 as text. It is
    // excluded on purpose, and test/inactive-state-a11y.test.ts is what stops anyone
    // using it as a foreground.
    expect(contrast(hex("--golden-yellow"), "#FFFFFF")).toBeLessThan(4.5);
  });

  it("is not vacuous — the arithmetic matches known values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // The exact value that shipped believing it was 4.6.
    expect(contrast("#8A8272", "#FFFFFF")).toBeCloseTo(3.81, 1);
    // …and the value that looked fine until the sunken surface was included.
    expect(contrast("#79725F", "#F5F2EC")).toBeCloseTo(4.29, 1);
  });
});
