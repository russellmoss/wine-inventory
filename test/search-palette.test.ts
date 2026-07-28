/**
 * Phase 4 — global search and the command palette (doc 01 §7, v2 §B31).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GROUP_ORDER,
  PER_GROUP_CAP,
  flattenForKeyboard,
  groupHits,
  looksLikeQuestion,
  moveIndex,
  rankHits,
  type SearchHit,
} from "@/lib/search/rank";
import { KEY_HINT, isAskShortcut, isPaletteShortcut } from "@/lib/nav/shortcuts";
import { allSectionItems, isSectionVisible, type SectionContext } from "@/lib/nav/sections";
import { code } from "./helpers/code";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const PALETTE = readFileSync(join(SRC, "components", "CommandPalette.tsx"), "utf8");
const QUERY = readFileSync(join(SRC, "lib", "search", "query.ts"), "utf8");
const ACTIONS = readFileSync(join(SRC, "lib", "search", "actions.ts"), "utf8");

const hit = (kind: SearchHit["kind"], label: string, subtitle?: string): SearchHit => ({
  kind,
  id: label,
  label,
  subtitle,
  href: "/x",
});

describe("keyboard hints say Ctrl, never a Mac glyph (owner instruction)", () => {
  it("spells the palette shortcut with Ctrl", () => {
    expect(KEY_HINT.palette).toBe("Ctrl K");
    expect(KEY_HINT.rail).toBe("Ctrl \\");
  });

  it("still MATCHES Cmd, so the shortcut works on a Mac even though we never show it", () => {
    // Refusing to advertise a key is a choice; refusing to match a real key press
    // would just be a bug.
    expect(isPaletteShortcut({ key: "k", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: "k", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "K", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k", metaKey: false, ctrlKey: false })).toBe(false);
    expect(isPaletteShortcut({ key: "j", metaKey: false, ctrlKey: true })).toBe(false);
  });

  it("Shift-Enter is the Ask affordance", () => {
    expect(isAskShortcut({ key: "Enter", metaKey: false, ctrlKey: false, shiftKey: true })).toBe(true);
    expect(isAskShortcut({ key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false })).toBe(false);
  });
});

describe("no Mac modifier glyph anywhere in src/", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(tsx?|css)$/.test(n)) out.push(p);
    }
    return out;
  }

  it("finds none", () => {
    // The handoff writes every shortcut as ⌘K. This winery runs Windows, so that
    // glyph points at a key the crew's keyboards do not have.
    const glyphs = /[⌘⌥⌃⇧]/; // Cmd, Option, Control-caret, Shift
    const offenders = walk(SRC)
      .map((p) => ({ rel: p.slice(SRC.length + 1).split(sep).join("/"), text: readFileSync(p, "utf8") }))
      // shortcuts.ts documents the rule and necessarily names the glyph.
      .filter((f) => f.rel !== "lib/nav/shortcuts.ts")
      .filter((f) => glyphs.test(code(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe("grouping and ranking (doc 01 §7)", () => {
  it("puts destinations first", () => {
    // Typing "lots" nearly always means "take me to Lots". Making someone scroll
    // past five barrels to reach it would make the palette slower than the sidebar.
    expect(GROUP_ORDER[0]).toBe("destination");
  });

  it("caps each group at 5 and reports how many were dropped", () => {
    const many = Array.from({ length: 9 }, (_, i) => hit("barrel", `B-${i}`));
    const [g] = groupHits(many);
    expect(g.hits).toHaveLength(PER_GROUP_CAP);
    expect(g.more).toBe(4);
  });

  it("never silently truncates — `more` is always the true remainder", () => {
    const [g] = groupHits(Array.from({ length: 5 }, (_, i) => hit("lot", `L-${i}`)));
    expect(g.more).toBe(0);
  });

  it("keeps groups in GROUP_ORDER regardless of hit order", () => {
    const groups = groupHits([hit("material", "DAP"), hit("destination", "Lots"), hit("lot", "25-PN-04")]);
    expect(groups.map((g) => g.kind)).toEqual(["destination", "lot", "material"]);
  });

  it("ranks an EXACT code match first", () => {
    // Someone typing a full barrel code wants THAT barrel, not a fuzzy neighbour.
    const ranked = rankHits(
      [hit("barrel", "CH-NEUTRAL-140"), hit("barrel", "CH-NEUTRAL-14"), hit("barrel", "X-CH-NEUTRAL-14")],
      "ch-neutral-14",
    );
    expect(ranked[0].label).toBe("CH-NEUTRAL-14");
  });

  it("prefers a prefix match over a mid-string one", () => {
    const ranked = rankHits([hit("lot", "X25-PN"), hit("lot", "25-PN-04")], "25-pn");
    expect(ranked[0].label).toBe("25-PN-04");
  });

  it("is stable between keystrokes — equal scores sort alphabetically", () => {
    const ranked = rankHits([hit("lot", "B-lot"), hit("lot", "A-lot")], "lot");
    expect(ranked.map((r) => r.label)).toEqual(["A-lot", "B-lot"]);
  });
});

describe("Ask is never first (doc 01 §7, §10)", () => {
  it("detects a question by punctuation or a wh-word", () => {
    expect(looksLikeQuestion("where is the syrah?")).toBe(true);
    expect(looksLikeQuestion("Where is the syrah")).toBe(true);
    expect(looksLikeQuestion("how much SO2")).toBe(true);
    expect(looksLikeQuestion("CH-NEUTRAL-14")).toBe(false);
    expect(looksLikeQuestion("25-PN-04")).toBe(false);
  });

  it("renders the Ask block AFTER the result groups", () => {
    // The assistant must not be load-bearing for findability. If Ask came first,
    // the deterministic answer would sit below a model call that might be slow,
    // wrong, or switched off.
    const groupsAt = PALETTE.indexOf("shown.groups.map((g) => (");
    const askAt = PALETTE.indexOf("{shown.question ? (");
    expect(groupsAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(groupsAt);
  });

  it("says the assistant does not run automatically", () => {
    expect(PALETTE).toContain("does not run automatically");
  });
});

describe("keyboard navigation", () => {
  it("wraps at both ends", () => {
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
  });

  it("does not divide by zero on an empty list", () => {
    expect(moveIndex(0, 1, 0)).toBe(0);
  });

  it("flattens groups in display order so ArrowDown matches what the eye sees", () => {
    const groups = groupHits([hit("destination", "Lots"), hit("barrel", "B-1")]);
    expect(flattenForKeyboard(groups).map((h) => h.label)).toEqual(["Lots", "B-1"]);
  });
});

describe("tenancy — the real risk in this phase (AC-P4)", () => {
  it("uses the tenant-extended prisma client, never a bare raw query", () => {
    // A bare $queryRaw bypasses the tenant extension entirely; if one is ever
    // needed for a trigram index it must go through runInTenantRawTx.
    const bare = code(QUERY);
    expect(bare).not.toContain("$queryRaw");
    expect(bare).not.toContain("$executeRaw");
    expect(bare).toContain('from "@/lib/prisma"');
  });

  it("bounds every DB branch, so a keystroke cannot scan 8,142 barrels", () => {
    const takes = (code(QUERY).match(/take: PER_KIND/g) ?? []).length;
    expect(takes).toBeGreaterThanOrEqual(6);
  });

  it("ignores a query too short to be an intent", () => {
    expect(code(QUERY)).toContain("if (q.length < 2) return [];");
  });

  it("resolves the role from the SESSION, never from the client", () => {
    // A client-supplied isAdmin would turn search into a privilege-escalation path.
    expect(ACTIONS).toContain("requireReadyUser()");
    expect(ACTIONS).toMatch(/const role = String\(user\.role/);
    expect(code(ACTIONS)).not.toMatch(/isAdmin\s*[,:]\s*(?:input|params|args)\./);
  });

  it("filters destinations by role before returning them", () => {
    // Otherwise search leaks the existence of admin-only destinations to a `user`.
    expect(QUERY).toContain("if (!isVisible(d, ctx)) continue;");
  });
});

describe("section coverage — the second way a surface goes missing (plan 104 D2)", () => {
  it("iterates SECTIONS alongside NAV_MODEL", () => {
    // A surface reachable from a sub-nav but not findable in Ctrl-K is half-lost.
    // One module feeds both so the two cannot disagree.
    expect(QUERY).toContain('from "@/lib/nav/sections"');
    expect(QUERY).toContain("for (const [hub, def] of Object.entries(SECTIONS))");
    expect(QUERY).toContain("for (const util of UTILITY_DESTINATIONS)");
  });

  it("role-filters section hits with the SAME predicate the sub-navs use", () => {
    // query.ts:18-20 — search must never become a side channel that reveals an
    // admin-only destination to a `user`. That now applies to 19 more routes.
    expect(QUERY).toContain("if (!isSectionVisible(item, ctx)) continue;");
    expect(QUERY).toContain("if (!isSectionVisible(util, ctx)) continue;");
  });

  it("names the parent hub, so Reports and Review are tellable apart", () => {
    expect(QUERY).toContain("`under ${hubLabel}`");
  });

  it("takes its context type from the nav model rather than re-declaring it", () => {
    // A locally-declared SearchContext is how the palette drifts into a laxer idea
    // of "admin-only" than the sidebar.
    expect(QUERY).toContain("export type SearchContext = SectionContext;");
  });

  it("passes the capability gates in, so Ctrl-K cannot offer a 404", () => {
    // En Tirage 404s when the sparkling program is off (K14).
    expect(ACTIONS).toContain("isSparklingEnabled()");
    expect(ACTIONS).toContain("isCustomCrushEnabled()");
  });
});

describe("no admin section leaks to a plain user (the query.ts:18-20 rule)", () => {
  const USER: SectionContext = { isAdmin: false, isDeveloper: false, hasVineyard: false, sparkling: true, customCrush: true };
  const ADMIN: SectionContext = { ...USER, isAdmin: true, hasVineyard: true };

  it("hides every admin-flagged section item from a plain user", () => {
    const leaked = allSectionItems()
      .filter((i) => i.admin)
      .filter((i) => isSectionVisible(i, USER))
      .map((i) => i.href);
    expect(leaked, "these would appear in a plain user's palette").toEqual([]);
  });

  it("still shows them to an admin — the filter is not just 'hide everything'", () => {
    const shown = allSectionItems().filter((i) => i.admin && isSectionVisible(i, ADMIN));
    expect(shown.length).toBeGreaterThan(0);
  });

  it("hides vineyard sections from a user with no membership", () => {
    const leaked = allSectionItems()
      .filter((i) => i.vineyard)
      .filter((i) => isSectionVisible(i, USER))
      .map((i) => i.href);
    expect(leaked).toEqual([]);
  });
});

describe("the palette dialog", () => {
  it("is a labelled modal dialog", () => {
    expect(PALETTE).toContain('role="dialog"');
    expect(PALETTE).toContain('aria-modal="true"');
    expect(PALETTE).toContain('aria-label="Search"');
  });

  it("wires combobox semantics to the active row", () => {
    expect(PALETTE).toContain('role="combobox"');
    expect(PALETTE).toContain("aria-activedescendant=");
    expect(PALETTE).toContain('role="listbox"');
    expect(PALETTE).toContain('role="option"');
  });

  it("labels the search field for assistive tech", () => {
    expect(PALETTE).toContain('className="sr-only"');
    expect(PALETTE).toContain("htmlFor={`${listId}-input`}");
  });

  it("debounces, so a keystroke is not a multi-table query", () => {
    expect(PALETTE).toContain("setTimeout(");
    expect(PALETTE).toContain("clearTimeout(t)");
  });

  it("drops a stale response rather than letting it overwrite a newer one", () => {
    expect(PALETTE).toContain("if (cancelled) return;");
  });

  it("closes on Escape", () => {
    expect(PALETTE).toContain('e.key === "Escape"');
  });
});
