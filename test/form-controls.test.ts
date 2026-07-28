/**
 * Select, NumericUnitInput and DateTimeControl (v2 §B9, §B10, §B12).
 *
 * Source-contract assertions — this repo has no jsdom, so rendering lives in
 * Playwright. What is pinned here is the part that regresses silently: the
 * accessible-name guarantees and the capture-screen rules that exist because of
 * how these are used (wet hands, a phone, a tank in front of you).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../src/components/ui/${f}`, import.meta.url)), "utf8");

/**
 * Strip comments before asserting a pattern is ABSENT.
 *
 * Recurring trap in this repo's static guards: the comment explaining *why* a
 * pattern is gone contains the pattern, so the guard fails on its own
 * documentation. Bitten three times now (`tone="gold"`, `fonts.googleapis.com`,
 * `role="alert"`) — so strip comments rather than reword prose forever.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const SELECT = read("Select.tsx");
const NUM = read("NumericUnitInput.tsx");
const DATE = read("DateTimeControl.tsx");

describe("Select — an accessible name is not optional (v2 §B10)", () => {
  it("makes `label` a REQUIRED prop", () => {
    // 34 selects in this app had no accessible name at all. A screen reader
    // announces "combo box" plus the current value and nothing about what it sets.
    expect(SELECT).toMatch(/^\s*label: string;/m);
    expect(SELECT).not.toMatch(/^\s*label\?: string;/m);
  });

  it("renders the label as .sr-only when hidden, never omits it", () => {
    // hideLabel changes visibility, never existence — the name survives either way.
    expect(SELECT).toContain('className={hideLabel ? "sr-only" : undefined}');
    expect(SELECT).toContain("htmlFor={selectId}");
  });

  it("carries the same describedby/invalid/alert wiring as Input", () => {
    expect(SELECT).toContain("aria-describedby={describedBy || undefined}");
    expect(SELECT).toContain("aria-invalid={error ? true : undefined}");
    expect(SELECT).toContain('role="alert"');
  });

  it("stays a native select", () => {
    // The OS picker is the best control on a phone in a cellar. A hand-rolled
    // listbox would be worse for touch, keyboard and screen readers at once.
    expect(SELECT).toContain("<select");
    expect(SELECT).not.toContain('role="listbox"');
  });
});

describe("NumericUnitInput — the capture-screen rules (v2 §B9)", () => {
  it("keeps the unit OUT of the value", () => {
    expect(NUM).toContain("borderLeft:");
    expect(NUM).toContain('aria-hidden="true"');
  });

  it("uses the decimal keypad and does not round a real measurement", () => {
    expect(NUM).toContain('inputMode="decimal"');
    expect(NUM).toContain('step="any"');
  });

  it("uses tabular figures so digits do not jitter while typing", () => {
    expect(NUM).toContain('fontVariantNumeric: "tabular-nums"');
  });

  it("announces the derived readout politely", () => {
    // The live `rate x volume = total` line is what catches a 10x dosing slip
    // before it reaches the ledger.
    expect(NUM).toContain('aria-live="polite"');
  });

  it("treats out-of-tolerance as a NOTE, never a block", () => {
    // The wine is already moving. A hard block at this moment is worse than a number.
    // Slice ONLY the tolerance block — the error block below it legitimately
    // does announce, so slicing to end-of-file would test the wrong thing.
    const bare = code(NUM);
    const from = bare.indexOf("tolerance && !tolerance.ok");
    const tol = bare.slice(from, bare.indexOf("{error ?", from));
    expect(tol.length).toBeGreaterThan(0);
    expect(tol).not.toContain('role="alert"');
    expect(NUM).not.toMatch(/disabled=\{[^}]*tolerance/);
  });

  it("has no spinner", () => {
    expect(NUM).not.toContain('type="number" step="1"');
    expect(NUM).not.toContain("stepUp");
  });

  it("keeps nudge targets at the touch nudge size", () => {
    expect(NUM).toContain('minWidth: "var(--touch-nudge)"');
    expect(NUM).toContain('minHeight: "var(--touch-nudge)"');
  });

  it("names each nudge for assistive tech", () => {
    expect(NUM).toMatch(/aria-label=\{`\$\{n > 0 \? "Increase" : "Decrease"\}/);
  });

  it("does not emit floating-point noise when nudging", () => {
    // 0.1 + 0.2 on a dose card is a support ticket.
    expect(NUM).toContain("toFixed(6)");
  });
});

describe("DateTimeControl (v2 §B12)", () => {
  it("requires a label and wires it", () => {
    expect(DATE).toMatch(/^\s*label: string;/m);
    expect(DATE).toContain("htmlFor={inputId}");
  });

  it("stays the NATIVE date input", () => {
    // §B12 requires typed input keeps working; a custom picker usually breaks it.
    expect(DATE).toContain("type={mode}");
    expect(DATE).not.toContain("Calendar");
  });

  it("supports date, datetime-local and time", () => {
    expect(DATE).toContain('mode?: "date" | "datetime-local" | "time"');
  });

  it("matches Input's metrics so it stops being a visible seam", () => {
    expect(DATE).toContain("inputMetrics(size)");
    expect(DATE).toContain("height: s.height");
  });
});

describe("all three share Input's disabled treatment", () => {
  it("uses a real surface, never an opacity wash", () => {
    for (const [name, src] of [
      ["Select", SELECT],
      ["NumericUnitInput", NUM],
      ["DateTimeControl", DATE],
    ] as const) {
      expect(src, `${name} still dims with opacity`).not.toMatch(/opacity: disabled/);
      expect(src, `${name} has no disabled surface`).toContain("var(--paper-200)");
    }
  });
});
