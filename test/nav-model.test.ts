/**
 * The v2 navigation model (doc 01 §2-§4).
 *
 * Pure-data assertions: the structure, the destination count and the role matrix
 * are checkable without a browser, which is the point of keeping the model as
 * data rather than as JSX.
 */
import { describe, expect, it } from "vitest";
import {
  NAV_MODEL,
  allDestinations,
  isVisible,
  aliasMap,
} from "@/lib/nav/model";

describe("structure", () => {
  it("has four groups, with the vineyards ABOVE the wine", () => {
    // 2026-07-28 (owner): growing and making are two halves of the same business, so
    // they are two equal groups rather than one destination with hidden sub-tabs.
    // The vineyards comes first because the fruit exists before the wine does.
    expect(NAV_MODEL.map((g) => g.id)).toEqual(["today", "vineyards", "wine", "business"]);
  });

  it("has 16 global destinations, down from 31 sidebar entries", () => {
    // 31 unordered entries is what was unnavigable — 13 was never a target in its own
    // right. Promoting Map Explorer, Weather & climate and Spray records out of
    // /vineyards/field-notes' sub-nav and into their own group took this to 16, and
    // four named groups of about four is still an IA you can hold in your head.
    expect(allDestinations()).toHaveLength(16);
  });

  it("opens the three working groups and collapses only 'the business'", () => {
    expect(NAV_MODEL.filter((g) => !g.defaultOpen).map((g) => g.id)).toEqual(["business"]);
  });

  it("puts work orders first — ordered by frequency of use", () => {
    // Today the daily cellar workflow is two clicks deep inside a collapsed group
    // while Help/feedback sits third from the top.
    expect(NAV_MODEL[0].items[0].href).toBe("/work-orders");
  });

  it("has no duplicate hrefs", () => {
    const hrefs = allDestinations().map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every destination href is absolute", () => {
    for (const d of allDestinations()) expect(d.href.startsWith("/")).toBe(true);
  });
});

describe("role visibility (doc 01 §3, OD-1)", () => {
  const user = { isAdmin: false, isDeveloper: false, hasVineyard: false };
  const vineyardUser = { isAdmin: false, isDeveloper: false, hasVineyard: true };
  const admin = { isAdmin: true, isDeveloper: false, hasVineyard: false };

  const byHref = (href: string) => allDestinations().find((d) => d.href === href)!;

  it("shows Records (/audit) to a plain user — OD-1 ratified, not changed", () => {
    // The handoff's matrix and the shipped code already agreed here.
    expect(isVisible(byHref("/audit"), user)).toBe(true);
  });

  it("opens Setup to every role — it is a HUB now, not the Settings screen", () => {
    // Plan 104 D4 repointed the destination from /settings to a new /setup index, and
    // that changes the role answer. /settings is one admin screen and could be
    // admin-only. /setup is a hub, and four of its eight children (Vessels,
    // Locations, Varieties & vineyards, Vendors) are `requireActiveTenant()` only and
    // were UNGATED in the legacy sidebar. Gating the hub would have quietly taken all
    // four away from every non-admin, leaving Ctrl-K — which needs a keyboard — as
    // the only way back. The children keep their own guards; the cards are filtered.
    expect(isVisible(byHref("/setup"), user)).toBe(true);
    expect(isVisible(byHref("/setup"), admin)).toBe(true);
  });

  it("keeps Compliance, Accounting and Blends admin-only", () => {
    for (const h of ["/compliance", "/accounting", "/blend"]) {
      expect(isVisible(byHref(h), user), `${h} leaked to a plain user`).toBe(false);
      expect(isVisible(byHref(h), admin)).toBe(true);
    }
  });

  it("hides Vineyards from a user with no vineyard, shows it with one", () => {
    expect(isVisible(byHref("/vineyards/field-notes"), user)).toBe(false);
    expect(isVisible(byHref("/vineyards/field-notes"), vineyardUser)).toBe(true);
    expect(isVisible(byHref("/vineyards/field-notes"), admin)).toBe(true);
  });

  it("shows the daily cellar destinations to every role", () => {
    for (const h of ["/work-orders", "/bulk", "/vineyards/harvest", "/lots", "/ferment", "/bottling", "/inventory"]) {
      expect(isVisible(byHref(h), user), `${h} hidden from a plain user`).toBe(true);
    }
  });
});

// The old `CONTEXTUAL_DESTINATIONS` block lived here. It was DELETED in plan 104:
// it had no runtime consumers, and it actively contradicted `unnavigable.ts` —
// listing /setup/equipment, /bottled, /finished-goods and /vineyards/planting-setup
// as "reached from Setup / an Inventory sub-tab" while those four are redirect stubs
// nothing links to. Two registries making opposite claims, both green, is the exact
// drift this phase exists to kill. `test/route-reachability.test.ts` is the authority.

describe("the four renames keep a search alias for one release", () => {
  it("maps every old label to its new destination", () => {
    const a = aliasMap();
    expect(a["wine in-progress"]).toBe("/bulk");
    expect(a["lot timeline"]).toBe("/lots");
    expect(a["field notes"]).toBe("/vineyards/field-notes");
    expect(a["harvest"]).toBe("/vineyards/harvest");
  });

  it("has exactly four aliases — one per rename", () => {
    expect(Object.keys(aliasMap())).toHaveLength(4);
  });
});
