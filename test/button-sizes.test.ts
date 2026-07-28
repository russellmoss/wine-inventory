/**
 * Button geometry (AC-C1) and the disabled/focus/pending contract (AC-C2, AC-C4).
 *
 * This repo has no jsdom or Testing Library, so component *rendering* is not
 * unit-testable here — the browser half lives in test/e2e/phase1-a11y.spec.ts.
 * What IS testable, and what actually regresses, is the geometry table and the
 * source-level contract of the component. Both are asserted here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BUTTON_SIZES, buttonMetrics } from "@/components/ui/button-sizes";

const BUTTON_SRC = readFileSync(
  fileURLToPath(new URL("../src/components/ui/Button.tsx", import.meta.url)),
  "utf8",
);

describe("AC-C1 — Button renders 44/48/56/68px for sm/md/lg/xl", () => {
  it("declares the four sizes and no others", () => {
    expect(Object.keys(BUTTON_SIZES)).toEqual(["sm", "md", "lg", "xl"]);
  });

  it("resolves to 44/48/56/68px", () => {
    expect(BUTTON_SIZES.sm.px).toBe(44);
    expect(BUTTON_SIZES.md.px).toBe(48);
    expect(BUTTON_SIZES.lg.px).toBe(56);
    expect(BUTTON_SIZES.xl.px).toBe(68);
  });

  it("sources every height that has a touch token from that token", () => {
    // The chain that makes `px` above true without a browser: these token names
    // are pinned to 44/56/68 in test/design-tokens.test.ts.
    expect(BUTTON_SIZES.sm.height).toBe("var(--touch-min)");
    expect(BUTTON_SIZES.lg.height).toBe("var(--touch-floor)");
    expect(BUTTON_SIZES.xl.height).toBe("var(--touch-floor-lg)");
    // md has no touch token — the default control height is not a floor concept.
    expect(BUTTON_SIZES.md.height).toBe("48px");
  });

  it("never drops a size below the 44px touch floor", () => {
    for (const [name, m] of Object.entries(BUTTON_SIZES)) {
      expect(m.px, `size "${name}" is under the 44px floor`).toBeGreaterThanOrEqual(44);
    }
  });

  it("falls back to md rather than rendering nothing for an unknown size", () => {
    expect(buttonMetrics(undefined)).toBe(BUTTON_SIZES.md);
    expect(buttonMetrics("nope" as never)).toBe(BUTTON_SIZES.md);
  });
});

describe("AC-C2 — disabled is a real surface, not opacity", () => {
  it("no longer dims the button with opacity", () => {
    // A real declaration, not the comment that explains why it is gone.
    expect(BUTTON_SRC).not.toMatch(/^\s*opacity:/m);
  });

  it("gives disabled its own surface, text and border colour", () => {
    expect(BUTTON_SRC).toContain('background: "var(--paper-200)"');
    expect(BUTTON_SRC).toContain('color: "var(--ink-600)"');
    expect(BUTTON_SRC).toContain('borderColor: "var(--paper-300)"');
  });

  it("keeps cursor: not-allowed", () => {
    expect(BUTTON_SRC).toContain('"not-allowed"');
  });
});

describe("AC-C4 — pending", () => {
  it("sets aria-busy", () => {
    expect(BUTTON_SRC).toContain("aria-busy={pending || undefined}");
  });

  it("blocks pointer AND keyboard activation — aria-busy alone does not stop a double-submit", () => {
    // Pointer: onClick returns before calling through.
    expect(BUTTON_SRC).toMatch(/if \(pending\) \{[\s\S]*?preventDefault\(\)[\s\S]*?return;/);
    // Keyboard: Enter and Space are the two activation keys for a <button>.
    expect(BUTTON_SRC).toMatch(/pending && \(e\.key === "Enter" \|\| e\.key === " "\)/);
  });

  it("keeps the resting label in flow so the width cannot change mid-submit", () => {
    expect(BUTTON_SRC).toContain('visibility: label ? "hidden" : "visible"');
  });

  it("does not use the native disabled attribute for pending — that would drop focus", () => {
    expect(BUTTON_SRC).toContain("disabled={disabled}");
    expect(BUTTON_SRC).not.toContain("disabled={disabled || pending}");
  });
});

describe("AC-F5 — the focus ring actually reaches this component", () => {
  it("re-derives :focus-visible locally", () => {
    // The global rule in tokens/base.css sets box-shadow, but Button sets
    // boxShadow INLINE (primary always does), and inline style beats any
    // selector. Without this the global ring never rendered here at all.
    expect(BUTTON_SRC).toContain('matches(":focus-visible")');
    expect(BUTTON_SRC).toContain('if (focusRing) merged.boxShadow = "var(--shadow-focus)"');
  });

  it("applies the ring after the caller's style prop, so a caller cannot erase it", () => {
    const styleSpread = BUTTON_SRC.indexOf("...style,");
    const ringApply = BUTTON_SRC.indexOf("if (focusRing) merged.boxShadow");
    expect(styleSpread).toBeGreaterThan(-1);
    expect(ringApply).toBeGreaterThan(styleSpread);
  });
});

describe("v2 §B6 — link variant sits on the sibling baseline", () => {
  it("no longer collapses its own height and padding", () => {
    const linkBlock = BUTTON_SRC.slice(BUTTON_SRC.indexOf("link: {"), BUTTON_SRC.indexOf("};", BUTTON_SRC.indexOf("link: {")));
    expect(linkBlock).not.toContain("padding: 0");
    expect(linkBlock).not.toContain('height: "auto"');
  });

  it("carries a persistent underline so it is not mistaken for ghost", () => {
    const linkBlock = BUTTON_SRC.slice(BUTTON_SRC.indexOf("link: {"), BUTTON_SRC.indexOf("};", BUTTON_SRC.indexOf("link: {")));
    expect(linkBlock).toContain('textDecoration: "underline"');
    expect(linkBlock).not.toContain("hover ? \"underline\" : \"none\"");
  });
});
