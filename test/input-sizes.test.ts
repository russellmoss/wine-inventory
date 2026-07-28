/**
 * Input geometry and the a11y wiring that was entirely missing (v2 §B8).
 *
 * The headline here is not the size table. It is that `aria-describedby`,
 * `aria-invalid`, `role="alert"` and a visible required marker were ALL absent
 * before 2026-07-28, across 165 `<Input>` call sites — the hint and error text
 * rendered on screen but was never associated with the field, so a screen-reader
 * user heard the label and nothing else, including on validation failure.
 * These assertions exist so that cannot silently regress.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INPUT_SIZES, inputMetrics } from "@/components/ui/input-sizes";

const SRC = readFileSync(fileURLToPath(new URL("../src/components/ui/Input.tsx", import.meta.url)), "utf8");
const CHECKBOX = readFileSync(
  fileURLToPath(new URL("../src/components/ui/Checkbox.tsx", import.meta.url)),
  "utf8",
);

describe("Input geometry (v2 §B8)", () => {
  it("declares the four sizes and no others", () => {
    expect(Object.keys(INPUT_SIZES)).toEqual(["sm", "md", "lg", "floor"]);
  });

  it("resolves to 44/48/56/60px", () => {
    expect(INPUT_SIZES.sm.px).toBe(44);
    expect(INPUT_SIZES.md.px).toBe(48);
    expect(INPUT_SIZES.lg.px).toBe(56);
    expect(INPUT_SIZES.floor.px).toBe(60);
  });

  it("never drops a size below the 44px floor — sm used to be 36", () => {
    for (const [name, m] of Object.entries(INPUT_SIZES)) {
      expect(m.px, `size "${name}" is under the 44px floor`).toBeGreaterThanOrEqual(44);
    }
  });

  it("sources heights from the touch tokens where one exists", () => {
    expect(INPUT_SIZES.sm.height).toBe("var(--touch-min)");
    expect(INPUT_SIZES.lg.height).toBe("var(--touch-floor)");
  });

  it("falls back to md rather than rendering nothing", () => {
    expect(inputMetrics(undefined)).toBe(INPUT_SIZES.md);
    expect(inputMetrics("nope" as never)).toBe(INPUT_SIZES.md);
  });
});

describe("Input a11y wiring — all four were absent before this", () => {
  it("associates the hint and the error with the field", () => {
    expect(SRC).toContain("aria-describedby={describedBy || undefined}");
    expect(SRC).toContain("const hintId =");
    expect(SRC).toContain("const errorId =");
  });

  it("describes ONLY the message actually rendered", () => {
    // Pointing aria-describedby at a node that is not in the DOM makes a screen
    // reader read stale text, or nothing.
    expect(SRC).toMatch(/error \? errorId : null/);
    expect(SRC).toMatch(/!error && hint \? hintId : null/);
  });

  it("marks the field invalid when errored, and only then", () => {
    expect(SRC).toContain("aria-invalid={error ? true : undefined}");
  });

  it("announces the error", () => {
    expect(SRC).toContain('role="alert"');
  });

  it("gives a required field a VISIBLE marker, and does NOT duplicate it in the name", () => {
    // The asterisk is visual only. `required`/`aria-required` already conveys the
    // state, so an sr-only "(required)" inside the <label> lands in the accessible
    // NAME and the user hears "Email required, required". Caught live in a
    // Playwright accessibility snapshot, which showed the name as "Email (required)".
    expect(SRC).toContain('aria-hidden="true"');
    expect(SRC).toContain("required={required}");
    expect(SRC).not.toContain('<span className="sr-only">(required)</span>');
  });

  it("keeps the unit adornment OUTSIDE the value", () => {
    // v2 §B9: never put the unit inside the number the user is editing.
    expect(SRC).toContain("adornmentRight");
    expect(SRC).toContain("borderLeft:");
  });

  it("uses a real disabled surface, not an opacity wash", () => {
    expect(SRC).not.toMatch(/opacity: disabled/);
    expect(SRC).toContain('background: disabled ? "var(--paper-200)"');
  });
});

describe("Checkbox (v2 §B11)", () => {
  it("puts the 20px visual inside a 44px target", () => {
    expect(CHECKBOX).toContain('minHeight: "var(--touch-min)"');
    expect(CHECKBOX).toContain("width: 20");
    expect(CHECKBOX).toContain("height: 20");
  });

  it("no longer dims the whole label with opacity", () => {
    expect(CHECKBOX).not.toMatch(/opacity: disabled/);
  });
});
