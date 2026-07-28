/**
 * SectionNav, MobileTabBar, and the flag contract (v2 §B2, §B3, doc 01 §9).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { code } from "./helpers/code";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf8");

const SECTION = read("components/ui/SectionNav.tsx");
const TABBAR = read("components/MobileTabBar.tsx");
const SHELL = read("components/AppShell.tsx");
const FLAG = read("lib/nav/flag.ts");
const GLOBALS = read("app/globals.css");

describe("SectionNav (v2 §B2)", () => {
  it("is a plain nav, NOT a tablist", () => {
    // These navigate to real URLs. Tab semantics would promise a screen-reader
    // user that arrow keys swap a panel in place, then navigate out from under them.
    expect(SECTION).toContain("<nav");
    const bare = code(SECTION);
    expect(bare).not.toContain('role="tablist"');
    expect(bare).not.toContain('role="tab"');
  });

  it("marks the active item with aria-current", () => {
    expect(SECTION).toContain('aria-current={active ? "page" : undefined}');
  });

  it("is 44px tall, not the 36px the old work-order toggle used", () => {
    expect(SECTION).toContain('height: "var(--touch-min)"');
  });

  it("requires an accessible name for the nav landmark", () => {
    expect(SECTION).toMatch(/^\s*label: string;/m);
    expect(SECTION).toContain("aria-label={label}");
  });
});

describe("MobileTabBar (doc 01 §9)", () => {
  it("always shows labels — icon-only navigation is prohibited", () => {
    expect(TABBAR).toContain("{t.label}");
    expect(TABBAR).toContain('fontSize: 12');
  });

  it("hides the glyph from assistive tech", () => {
    expect(TABBAR).toContain('aria-hidden="true"');
  });

  it("respects the safe-area inset", () => {
    // Without it the bottom row sits under the home indicator and is unreachable.
    expect(TABBAR).toContain("env(safe-area-inset-bottom)");
  });

  it("gives each tab a >=56px target spanning the whole cell", () => {
    expect(TABBAR).toContain("minHeight: 56");
    expect(TABBAR).toContain("gridTemplateColumns");
  });

  it("names the badge for a screen reader, not just visually", () => {
    expect(TABBAR).toContain('className="sr-only"');
  });

  it("marks the active tab with aria-current", () => {
    expect(TABBAR).toContain('aria-current={active ? "page" : undefined}');
  });
});

describe("the flag contract", () => {
  it("defaults OFF", () => {
    expect(FLAG).toContain('process.env.NEXT_PUBLIC_NAV_V2 === "1"');
  });

  it("keeps BOTH nav models in the same build so rollback needs no deploy", () => {
    expect(SHELL).toContain("NAV_V2_ENABLED ? (");
    // The legacy groups must still be present in the else arm.
    expect(SHELL).toContain('CollapsibleNavGroup label="Winery"');
    expect(SHELL).toContain('CollapsibleNavGroup label="Vineyards"');
    expect(SHELL).toContain('CollapsibleNavGroup label="Setup"');
  });

  it("gates the tab bar on the same flag", () => {
    expect(SHELL).toContain("NAV_V2_ENABLED ? (\n        <MobileTabBar");
  });

  it("hides the tab bar on desktop", () => {
    expect(GLOBALS).toMatch(/min-width: 1024px\)[\s\S]*?\.bw-tabbar \{ display: none; \}/);
  });

  it("clears the main region so the last row is not under the tabs", () => {
    expect(GLOBALS).toContain("padding-bottom: calc(56px + env(safe-area-inset-bottom))");
  });
});
