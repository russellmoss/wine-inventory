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
  CONTEXTUAL_DESTINATIONS,
  allDestinations,
  isVisible,
  aliasMap,
} from "@/lib/nav/model";

describe("structure", () => {
  it("has exactly 3 groups, replacing today's 4", () => {
    expect(NAV_MODEL.map((g) => g.id)).toEqual(["today", "wine", "business"]);
  });

  it("has exactly 13 global destinations, down from 31 sidebar entries", () => {
    // 31 entries is not navigable. This number is the whole point of the IA work.
    expect(allDestinations()).toHaveLength(13);
  });

  it("collapses only 'the business' by default", () => {
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

  it("keeps Setup admin-only", () => {
    expect(isVisible(byHref("/settings"), user)).toBe(false);
    expect(isVisible(byHref("/settings"), admin)).toBe(true);
  });

  it("keeps Compliance, Accounting and Blends admin-only", () => {
    for (const h of ["/compliance", "/accounting", "/blend"]) {
      expect(isVisible(byHref(h), user), `${h} leaked to a plain user`).toBe(false);
      expect(isVisible(byHref(h), admin)).toBe(true);
    }
  });

  it("hides Vineyard rounds from a user with no vineyard, shows it with one", () => {
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

describe("nothing is deleted (doc 01 §4)", () => {
  it("records where every removed destination is still reached from", () => {
    expect(CONTEXTUAL_DESTINATIONS.length).toBeGreaterThanOrEqual(20);
    for (const c of CONTEXTUAL_DESTINATIONS) {
      expect(c.href.startsWith("/")).toBe(true);
      expect(c.reachedFrom.length, `${c.href} has no stated route back`).toBeGreaterThan(0);
    }
  });

  it("does not list a destination as both global and contextual", () => {
    const global = new Set(allDestinations().map((d) => d.href));
    const both = CONTEXTUAL_DESTINATIONS.filter((c) => global.has(c.href));
    expect(both.map((b) => b.href)).toEqual([]);
  });
});

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
