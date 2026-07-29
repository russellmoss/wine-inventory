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

describe("role filtering reaches BOTH nav surfaces (plan 104 D5)", () => {
  const SEARCH_ACTIONS = read("lib/search/actions.ts");

  it("derives hasVineyard from real membership, not from isAdmin", () => {
    // `hasVineyard: isAdmin` was a live bug the flag was hiding: with NAV_V2 on, a
    // non-admin vineyard manager with real memberships lost "Vineyard rounds" from
    // the sidebar entirely — the destination hidden from the person it exists for.
    expect(code(SHELL)).not.toContain("hasVineyard: isAdmin");
    expect(SHELL).toContain("const hasVineyard = (user.vineyardIds?.length ?? 0) > 0 || isAdmin;");
  });

  it("filters the mobile tab bar through the same value", () => {
    // The other half: the tab bar showed Vineyard to everyone, unfiltered, while the
    // desktop hid it. Two surfaces, two different answers, same user.
    expect(SHELL).toContain("...(hasVineyard ? [{ href: \"/vineyards/field-notes\"");
  });

  it("uses the same admin predicate in search as in the shell", () => {
    // The palette hand-rolled `role === "admin" || role === "owner"`, which misses
    // `developer` — so a developer's palette hid destinations their sidebar showed.
    // Both the fix and the guard now point at navContext(), the single server-side
    // answer; the action must delegate rather than keep a second copy.
    const CONTEXT = read("lib/nav/server-context.ts");
    expect(CONTEXT).toContain("isTenantAdminLike(user)");
    expect(CONTEXT).toContain("user.vineyardIds.length > 0 || isAdmin");
    expect(SEARCH_ACTIONS).toContain("navContext()");
    expect(code(SEARCH_ACTIONS)).not.toContain('role === "admin" || role === "owner"');
    expect(code(SEARCH_ACTIONS)).not.toContain("hasVineyard:");
  });

  it("gives the brand mark and Help / feedback a real link", () => {
    // Neither `/` nor `/help/feedback` is in the 13 destinations. Before this both
    // were URL-only under the flag: the home page and the bug report, unreachable.
    expect(SHELL).toContain('<Link href="/" onClick={onNavigate} aria-label="Cellarhand — dashboard"');
    expect(SHELL).toContain('<Link href="/help/feedback"');
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
    // Line endings are normalised because this is the only assertion in the file that spans
    // a newline, and `core.autocrlf=true` (the default on Windows, and .gitattributes pins
    // LF only for the invariant register, not for .tsx) checks AppShell.tsx out as CRLF.
    // Without this the guard could never match locally: it passed in CI and was vacuous on
    // every Windows working tree, which is the worst state for a guard to be in.
    expect(SHELL.replace(/\r\n/g, "\n")).toContain("NAV_V2_ENABLED ? (\n        <MobileTabBar");
  });

  it("hides the tab bar on desktop", () => {
    expect(GLOBALS).toMatch(/min-width: 1024px\)[\s\S]*?\.bw-tabbar \{ display: none; \}/);
  });

  it("does not let an INLINE display defeat that rule", () => {
    // This assertion existed in CSS form only, and passed for months while the tab
    // bar rendered on desktop anyway: MobileTabBar set `display: "grid"` in its
    // inline style object, and inline beats any stylesheet rule including a media
    // query. Two nav landmarks named "Main", two aria-current="page" items, and the
    // phone navigation shown to every desktop user. AppShell's sidebarBox carries a
    // comment warning about exactly this; the tab bar did not.
    expect(code(TABBAR)).not.toMatch(/display:\s*"grid"/);
    expect(GLOBALS).toContain(".bw-tabbar { display: grid; }");
  });

  it("clears the main region so the last row is not under the tabs", () => {
    expect(GLOBALS).toContain("padding-bottom: calc(56px + env(safe-area-inset-bottom))");
  });
});
