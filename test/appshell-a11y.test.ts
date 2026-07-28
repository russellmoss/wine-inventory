/**
 * AppShell accessibility contract (AC-S1, AC-F2, AC-F3, AC-F4).
 *
 * Three gaps that were zero-across-the-whole-app before Phase 1: no skip link, no
 * `aria-current` anywhere, and a nav disclosure whose only state cue was a rotating
 * chevron. The behavioural proof (tab-stop count, focus actually landing on <main>)
 * needs a browser and lives in test/e2e/phase1-a11y.spec.ts; this pins the source
 * so the attributes cannot quietly disappear in a refactor.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHELL = readFileSync(fileURLToPath(new URL("../src/components/AppShell.tsx", import.meta.url)), "utf8");
const GLOBALS = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

describe("AC-S1 — the skip link", () => {
  it("exists and points at #main", () => {
    expect(SHELL).toContain('<a href="#main" className="skip-link">');
  });

  it("is the first thing rendered inside the shell root", () => {
    const shellRoot = SHELL.indexOf('<div className="bw-shell"');
    const skip = SHELL.indexOf('href="#main"');
    const firstHeader = SHELL.indexOf("<header");
    expect(skip).toBeGreaterThan(shellRoot);
    // Anything focusable before it defeats the point.
    expect(skip).toBeLessThan(firstHeader);
  });

  it("has a target that can actually receive focus", () => {
    // Without tabIndex={-1} the browser moves the hash but not the focus ring, and
    // the link silently does nothing for a keyboard user.
    expect(SHELL).toContain('<main id="main" tabIndex={-1}');
  });

  it("is hidden until focused, not display:none", () => {
    expect(GLOBALS).toContain(".skip-link {");
    expect(GLOBALS).toContain(".skip-link:focus");
    const rule = GLOBALS.slice(GLOBALS.indexOf(".skip-link {"), GLOBALS.indexOf(".skip-link:focus"));
    expect(rule).not.toContain("display: none");
    expect(rule).not.toContain("visibility: hidden");
  });
});

describe("AC-F3 — aria-current", () => {
  it("is set on every nav link variant, all three of them", () => {
    // The shell renders nav links in three shapes: plain, with-a-count, and inside a
    // collapsible group. `active` was already computed for the visual style in each;
    // only the attribute was missing.
    expect((SHELL.match(/aria-current=\{/g) ?? []).length).toBe(3);
  });

  it("emits the attribute only when active, never aria-current=\"false\"", () => {
    expect(SHELL).not.toContain('aria-current="false"');
    expect(SHELL).toMatch(/aria-current=\{[^}]*\? "page" : undefined\}/);
  });

  it("names the nav landmark", () => {
    expect(SHELL).toContain('<nav aria-label="Main"');
  });
});

describe("AC-F4 — aria-expanded on every disclosure", () => {
  it("wires the nav-group toggle with aria-expanded + aria-controls", () => {
    expect(SHELL).toContain("aria-expanded={open}");
    expect(SHELL).toContain("aria-controls={bodyId}");
    expect(SHELL).toContain("id={bodyId}");
  });

  it("generates the id with useId rather than a hand-rolled counter", () => {
    expect(SHELL).toContain("React.useId()");
  });

  it("hides the chevron once the state is exposed programmatically", () => {
    expect(SHELL).toMatch(/aria-hidden="true"[^>]*rotate\(90deg\)/);
  });

  it("exposes the mobile drawer's state on the hamburger", () => {
    expect(SHELL).toContain("aria-expanded={drawer}");
  });
});

describe("AC-F1 — shell controls meet the touch floor", () => {
  it("sizes the hamburger and drawer-close from --touch-min", () => {
    // They were 38x32 and an unsized glyph button. Phase 3 deletes the drawer for a
    // tab bar, so this is the floor fix only, not full drawer a11y.
    expect(SHELL).toContain('minWidth: "var(--touch-min)", minHeight: "var(--touch-min)"');
    expect(SHELL).toContain('width: "var(--touch-min)", height: "var(--touch-min)"');
  });
});
