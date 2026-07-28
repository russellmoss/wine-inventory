/**
 * Design-token guard (Cellarhand v2, Phase 0).
 *
 * The status ramp, provenance and data-viz values are hand-transcribed hex/rgba
 * literals from the design system doc (docs/design/cellarhand-v2-handoff/05-design-system-v2.md
 * §A4–A6). A single mistyped digit produces a plausible-looking colour that no
 * build, lint or type check can catch, and that a human reading the CSS will not
 * spot either. So the values are asserted here, against the spec, once.
 *
 * Pure text assertions on the CSS source — no DOM, no CSS engine, runs under the
 * repo's `environment: "node"` vitest config like every other test here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readToken(file: string): (name: string) => string | null {
  const src = readFileSync(fileURLToPath(new URL(`../src/styles/tokens/${file}`, import.meta.url)), "utf8");
  return (name: string) => {
    // Match `--name: value;` — the last declaration wins, as in CSS.
    const re = new RegExp(`--${name}\\s*:\\s*([^;]+);`, "g");
    let value: string | null = null;
    for (const m of src.matchAll(re)) value = m[1].trim();
    return value;
  };
}

const color = readToken("colors.css");
const spacing = readToken("spacing.css");
const icons = readToken("icons.css");

describe("status ramp (§A4)", () => {
  const RAMP: Record<string, [string, string]> = {
    neutral: ["#4D4A42", "#ECE7DC"],
    active: ["#095972", "rgba(9, 89, 114, 0.12)"],
    held: ["#8A6414", "rgba(215, 159, 50, 0.16)"],
    done: ["#175242", "rgba(23, 82, 66, 0.12)"],
    attention: ["#A5342D", "rgba(182, 61, 53, 0.12)"],
    review: ["#6B484D", "rgba(107, 72, 77, 0.14)"],
  };

  for (const [name, [fg, bg]] of Object.entries(RAMP)) {
    it(`--status-${name}-* matches the spec`, () => {
      expect(color(`status-${name}-fg`)).toBe(fg);
      expect(color(`status-${name}-bg`)).toBe(bg);
    });
  }

  it("never uses wine — wine means brand and primary action only", () => {
    for (const name of Object.keys(RAMP)) {
      expect(color(`status-${name}-fg`)?.toUpperCase()).not.toContain("722F37");
      expect(color(`status-${name}-bg`)).not.toContain("114, 47, 55");
    }
  });
});

describe("provenance tokens (§A5)", () => {
  it("measured is green-ink, estimated is golden-ink", () => {
    expect(color("provenance-measured-fg")).toBe("#175242");
    expect(color("provenance-measured-bg")).toBe("rgba(23, 82, 66, 0.12)");
    expect(color("provenance-estimated-fg")).toBe("#8A6414");
    expect(color("provenance-estimated-bg")).toBe("rgba(215, 159, 50, 0.16)");
  });
});

describe("data-viz series (§A6)", () => {
  const SERIES = ["#722F37", "#095972", "#175242", "#8A6414", "#6B484D", "#4D4A42"];

  it("carries the six ordered series in spec order", () => {
    SERIES.forEach((hex, i) => expect(color(`viz-${i + 1}`)).toBe(hex));
  });

  it("every series colour is distinct — a duplicate silently merges two series", () => {
    expect(new Set(SERIES.map((h) => h.toUpperCase())).size).toBe(SERIES.length);
  });

  it("carries the threshold, grid and axis tokens", () => {
    expect(color("viz-threshold")).toBe("#8A6414");
    expect(color("viz-grid")).toBe("#ECE7DC");
    expect(color("viz-axis")).toBe("#DED7C6");
  });
});

describe("text-safe ink variants (§A2)", () => {
  it("defines the darkened variants that can legally carry text", () => {
    expect(color("golden-ink")).toBe("#8A6414");
    expect(color("red-ink")).toBe("#A5342D");
    expect(color("green-ink")).toBe("#175242");
    expect(color("blue-ink")).toBe("#095972");
    expect(color("ink-500")).toBe("#8A8272");
    expect(color("warning-deep-text")).toBe("#5C440E");
  });

  it("keeps --text-meta pointed at the new ink-500, not an ad-hoc grey", () => {
    expect(color("text-meta")).toBe("var(--ink-500)");
  });
});

describe("density and touch targets (§A8, §A14)", () => {
  it("defines the density row heights", () => {
    expect(spacing("row-h-comfortable")).toBe("56px");
    expect(spacing("row-h-default")).toBe("46px");
    expect(spacing("row-h-dense")).toBe("38px");
    expect(spacing("row-h-active")).toBe("56px");
  });

  it("defines the touch floor at 44px — the rule the whole re-baseline turns on", () => {
    expect(spacing("touch-min")).toBe("44px");
    expect(spacing("touch-floor")).toBe("56px");
    expect(spacing("touch-floor-lg")).toBe("68px");
    expect(spacing("touch-nudge")).toBe("46px");
  });

  it("defines the responsive breakpoints", () => {
    expect(spacing("bp-phone-lg")).toBe("430px");
    expect(spacing("bp-tablet")).toBe("768px");
    expect(spacing("bp-desktop")).toBe("1024px");
    expect(spacing("bp-wide")).toBe("1440px");
  });
});

describe("icon tokens (§A15)", () => {
  it("defines the icon size scale and the constant stroke", () => {
    expect(icons("icon-nav")).toBe("20px");
    expect(icons("icon-tab")).toBe("24px");
    expect(icons("icon-inline")).toBe("17px");
    expect(icons("icon-feature")).toBe("40px");
    expect(icons("icon-stroke")).toBe("1.6");
  });
});

describe("focus ring", () => {
  it("keeps the wine ring and adds the on-dark counterpart", () => {
    expect(color("focus-ring")).toBe("rgba(114, 47, 55, 0.45)");
    expect(color("focus-ring-on-dark")).toBe("rgba(255, 248, 241, 0.65)");
  });
});
