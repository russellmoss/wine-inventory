/**
 * The v2 SUB-navigation model (doc 01 §4/§5, plan 104 D2/D4).
 *
 * Pure-data assertions, same discipline as test/nav-model.test.ts: the second level
 * of the IA is data, so its shape and its role matrix are checkable without a browser.
 *
 * The load-bearing ones are the two that keep the model honest against the FIRST
 * level — no href in both `NAV_MODEL` and `SECTIONS`, and no href in two sections —
 * because either would mean the sidebar and a sub-nav disagreeing about where a
 * surface lives.
 */
import { describe, expect, it } from "vitest";
import {
  SECTIONS,
  UTILITY_DESTINATIONS,
  allSectionItems,
  isSectionVisible,
  sectionHubs,
  sectionParentLabel,
  sectionsFor,
  type SectionContext,
} from "@/lib/nav/sections";
import { allDestinations } from "@/lib/nav/model";

const ADMIN: SectionContext = { isAdmin: true, isDeveloper: false, hasVineyard: true, sparkling: true, customCrush: true };
const USER: SectionContext = { isAdmin: false, isDeveloper: false, hasVineyard: false, sparkling: true, customCrush: true };
const VINEYARD_USER: SectionContext = { ...USER, hasVineyard: true };

describe("shape", () => {
  it("keys every section by a hub that is a real global destination", () => {
    // A section strip on a page the sidebar cannot reach is a second orphan, not a fix.
    const globals = new Set(allDestinations().map((d) => d.href));
    for (const hub of sectionHubs()) {
      expect(globals.has(hub), `${hub} has sub-navigation but is not a NAV_MODEL destination`).toBe(true);
    }
  });

  it("uses absolute hrefs everywhere", () => {
    for (const i of [...allSectionItems(), ...UTILITY_DESTINATIONS]) {
      expect(i.href.startsWith("/"), `${i.href} is not absolute`).toBe(true);
    }
  });

  it("gives every item a label and every hub a landmark name + self-link label", () => {
    for (const i of [...allSectionItems(), ...UTILITY_DESTINATIONS]) expect(i.label.length).toBeGreaterThan(0);
    for (const [hub, def] of Object.entries(SECTIONS)) {
      expect(def.label.length, `${hub} has no nav landmark name`).toBeGreaterThan(0);
      expect(def.hubLabel.length, `${hub} has no self-link label`).toBeGreaterThan(0);
    }
  });

  it("never lists the same href in two sections", () => {
    const hrefs = allSectionItems().map((i) => i.href);
    const dupes = hrefs.filter((h, n) => hrefs.indexOf(h) !== n);
    expect(dupes, `an href may only live in one section: ${dupes.join(", ")}`).toEqual([]);
  });

  it("never lists an href that is already a global destination", () => {
    // The nav model's own both-lists rule, extended to the second level. A surface in
    // the sidebar AND in a sub-nav gives two answers to "where does this live".
    const globals = new Set(allDestinations().map((d) => d.href));
    const both = [...allSectionItems(), ...UTILITY_DESTINATIONS].filter((i) => globals.has(i.href));
    expect(both.map((b) => b.href)).toEqual([]);
  });

  it("keeps a section item out of the palette-only list", () => {
    const sectioned = new Set(allSectionItems().map((i) => i.href));
    expect(UTILITY_DESTINATIONS.filter((u) => sectioned.has(u.href)).map((u) => u.href)).toEqual([]);
  });

  it("keeps tab strips to 5 items, and only the card hub is allowed past it", () => {
    // SectionNav's own docstring: more than 5 is a sign the destination should split.
    for (const [hub, def] of Object.entries(SECTIONS)) {
      if (def.render === "cards") continue;
      expect(def.items.length, `${hub} has ${def.items.length} tabs — split it or render cards`).toBeLessThanOrEqual(5);
    }
  });

  it("stays short on the palette-only escape hatch", () => {
    // This is the one classification the reachability guard could hide behind.
    expect(UTILITY_DESTINATIONS.length).toBeLessThanOrEqual(3);
  });
});

describe("D4 — Setup keeps every legacy sidebar entry", () => {
  // The legacy SETUP group is the authority on what must survive the IA rewrite.
  const LEGACY_SETUP = [
    "/vessels",
    "/locations",
    "/reference",
    "/setup/vendors",
    "/setup/growers",
    "/setup/clients",
    "/settings",
    "/users",
  ];

  it("has all eight", () => {
    const hrefs = SECTIONS["/setup"].items.map((i) => i.href);
    expect(LEGACY_SETUP.filter((h) => !hrefs.includes(h))).toEqual([]);
  });

  it("renders as grouped cards, not a tab strip", () => {
    expect(SECTIONS["/setup"].render).toBe("cards");
    for (const i of SECTIONS["/setup"].items) expect(i.group, `${i.href} has no card group`).toBeTruthy();
  });
});

describe("role and capability visibility", () => {
  const find = (href: string) => allSectionItems().find((i) => i.href === href)!;

  it("hides admin-only sections from a plain user", () => {
    for (const h of ["/work-orders/review", "/work-orders/task-types", "/users", "/settings", "/setup/growers"]) {
      expect(isSectionVisible(find(h), USER), `${h} leaked to a plain user`).toBe(false);
      expect(isSectionVisible(find(h), ADMIN)).toBe(true);
    }
  });

  it("shows the open work-order sections to everyone", () => {
    for (const h of ["/work-orders/templates", "/samples", "/reports"]) {
      expect(isSectionVisible(find(h), USER), `${h} hidden from a plain user`).toBe(true);
    }
  });

  it("gates the vineyard sections on membership, exactly like the hub above them", () => {
    for (const h of ["/vineyards/maps", "/vineyards/weather", "/vineyards/sprays"]) {
      expect(isSectionVisible(find(h), USER)).toBe(false);
      expect(isSectionVisible(find(h), VINEYARD_USER)).toBe(true);
      expect(isSectionVisible(find(h), ADMIN)).toBe(true);
    }
  });

  it("hides En Tirage when the sparkling program is off — the route 404s without it", () => {
    expect(isSectionVisible(find("/cellar/en-tirage"), { ...ADMIN, sparkling: false })).toBe(false);
    expect(isSectionVisible(find("/cellar/en-tirage"), ADMIN)).toBe(true);
  });

  it("hides the custom-crush surfaces when the program is off", () => {
    for (const h of ["/vineyards/harvest/weigh-tags", "/setup/clients"]) {
      expect(isSectionVisible(find(h), { ...ADMIN, customCrush: false })).toBe(false);
      expect(isSectionVisible(find(h), ADMIN)).toBe(true);
    }
  });
});

describe("the palette subtitle is its own disclosure surface", () => {
  it("names the parent when the caller can see it", () => {
    expect(sectionParentLabel("/accounting", ADMIN)).toBe("Accounting");
    expect(sectionParentLabel("/setup", ADMIN)).toBe("Setup");
    expect(sectionParentLabel("/lots", USER)).toBe("Lots");
  });

  it("drops the parent name when the hub is one this caller may not see", () => {
    // A plain user is entitled to /reports and /vessels — their pages admit any
    // tenant user — but "under Accounting" / "under Setup" would tell them an
    // admin-only destination exists. The hit stays; the name goes.
    expect(sectionParentLabel("/accounting", USER)).toBeUndefined();
    expect(sectionParentLabel("/setup", USER)).toBeUndefined();
  });

  it("still shows those hits — hiding them would cost five surfaces their last way in", () => {
    const find = (href: string) => allSectionItems().find((i) => i.href === href)!;
    for (const h of ["/reports", "/vessels", "/locations", "/reference", "/setup/vendors"]) {
      expect(isSectionVisible(find(h), USER), `${h} lost its only route in`).toBe(true);
    }
  });

  it("hides the vineyard parent from a user with no membership", () => {
    expect(sectionParentLabel("/vineyards/field-notes", USER)).toBeUndefined();
    expect(sectionParentLabel("/vineyards/field-notes", VINEYARD_USER)).toBe("Vineyard rounds");
  });
});

describe("sectionsFor — what actually renders", () => {
  it("puts the hub's own self-link first, so there is always a way back", () => {
    const items = sectionsFor("/work-orders", ADMIN);
    expect(items[0].href).toBe("/work-orders");
    expect(items.map((i) => i.href)).toEqual([
      "/work-orders",
      "/work-orders/review",
      "/work-orders/templates",
      "/work-orders/task-types",
    ]);
  });

  it("drops the filtered items but keeps the strip when at least one survives", () => {
    expect(sectionsFor("/work-orders", USER).map((i) => i.href)).toEqual([
      "/work-orders",
      "/work-orders/templates",
    ]);
  });

  it("renders nothing at all when every item is filtered out", () => {
    // A strip whose only entry is "you are here" is noise, not navigation.
    expect(sectionsFor("/bottling", { ...ADMIN, sparkling: false })).toEqual([]);
    expect(sectionsFor("/vineyards/harvest", { ...ADMIN, customCrush: false })).toEqual([]);
  });

  it("returns nothing for a route with no sub-navigation", () => {
    expect(sectionsFor("/inventory", ADMIN)).toEqual([]);
    expect(sectionsFor("/nope", ADMIN)).toEqual([]);
  });
});
