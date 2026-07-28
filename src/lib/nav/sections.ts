/**
 * The v2 SUB-navigation model — the second level of the IA (doc 01 §4/§5).
 *
 * Phase 3 replaced a 31-entry sidebar with 13 global destinations and promised the
 * other ~28 operator surfaces would be reached from sub-navigation. That
 * sub-navigation was never built: `SectionNav` shipped in Phase 2 with zero
 * consumers, and with `NEXT_PUBLIC_NAV_V2=1` only 17 of 56 static routes were
 * reachable. Nothing was deleted — there was simply no way in.
 *
 * This module is that second level, and it is deliberately ONE module (D2).
 *
 * ## Why one module, two consumers
 * There are exactly two ways for a surface to go missing: no nav link, and no
 * search hit. `SECTIONS` feeds BOTH the per-hub `<SectionNav>` strips and the
 * Ctrl-K palette, so a surface cannot be reachable in one and invisible in the
 * other. It also gives the routes the labels and role flags that
 * `CONTEXTUAL_DESTINATIONS` lacks — that list carries only `{ href, reachedFrom }`,
 * which is not enough to render a link or to filter one by role.
 *
 * ## Why it lives BESIDE NAV_MODEL, not inside it
 * `test/nav-model.test.ts` asserts exactly 13 global destinations, and
 * `test/appshell-a11y.test.ts` asserts exactly 3 `aria-current={` in `AppShell.tsx`.
 * Growing the model or adding a shell-level tab layer fails both. Sections are a
 * separate keyed record, rendered per-hub (D1).
 *
 * Pure data: no React, no prisma, so the role matrix is unit-testable without a browser.
 */

import { allDestinations, isVisible } from "./model";

/** A capability gate — the tenant program that has to be on for the item to exist. */
export type SectionRequirement = "sparkling" | "customCrush";

export interface SectionItem {
  href: string;
  label: string;
  /** Admin-and-above only. Mirrors the page's OWN guard — a mismatch is a dead link or a leak. */
  admin?: boolean;
  /** Needs vineyard membership OR admin. */
  vineyard?: boolean;
  /** Hidden unless the tenant program is enabled. */
  requires?: SectionRequirement;
  /** Card-hub grouping (D4). Ignored by tab-strip hubs. */
  group?: string;
  /** One line of "what is this for" copy. Card hubs show it; tab strips do not. */
  blurb?: string;
}

export interface SectionDef {
  /** Accessible name for the `<nav>` landmark, e.g. "Work orders sections". */
  label: string;
  /** Label for the hub's own self-link, rendered FIRST so there is always a way back. */
  hubLabel: string;
  /**
   * `tabs` (default) = a `SectionNav` strip at the top of the hub page.
   * `cards` = a grouped index page. `/setup` uses this: 8 items is past the point
   * where a tab strip is readable (SectionNav's own docstring says >5 means split).
   */
  render?: "tabs" | "cards";
  items: SectionItem[];
}

/** The visibility context. Extends the nav model's with the two capability gates. */
export interface SectionContext {
  isAdmin: boolean;
  isDeveloper: boolean;
  hasVineyard: boolean;
  sparkling: boolean;
  customCrush: boolean;
}

/**
 * Sub-navigation, keyed by the hub's own href.
 *
 * Populated from doc 01 §4/§5 **as corrected against source**. Three corrections
 * worth naming, because the doc is stale and re-deriving them costs an afternoon:
 *
 *   - `/setup/equipment`, `/bottled` and `/finished-goods` are NOT sections. All
 *     three are `redirect()` stubs that bounce to `/inventory` (plan 080 U6), so a
 *     tab pointing at one would take the user somewhere other than where it says.
 *     They are classified as redirect stubs in `unnavigable.ts` instead.
 *   - `/inventory` therefore gets no strip. Its three sections are query-param
 *     views of ONE route (`InventoryTabs`), which is a different thing (D6).
 *   - `/work-orders/task-types` lives under Work orders, not under Setup. Doc 01 §4
 *     says "Setup → Work orders", but it is a work-order authoring surface and an
 *     href may only appear in one section (asserted in test/nav-sections.test.ts).
 */
export const SECTIONS: Record<string, SectionDef> = {
  "/work-orders": {
    label: "Work order sections",
    hubLabel: "Open work",
    items: [
      { href: "/work-orders/review", label: "Review", admin: true },
      { href: "/work-orders/templates", label: "Templates" },
      { href: "/work-orders/task-types", label: "Task types", admin: true },
    ],
  },

  "/lots": {
    label: "Lot sections",
    hubLabel: "Lots",
    items: [{ href: "/samples", label: "Samples" }],
  },

  "/accounting": {
    label: "Accounting sections",
    hubLabel: "Sync status",
    items: [{ href: "/reports", label: "Reports" }],
  },

  "/bottling": {
    label: "Bottling sections",
    hubLabel: "Bottling runs",
    // The En Tirage worklist 404s when the sparkling program is off (K14), so the
    // link has to disappear with it or the tab is a trap.
    items: [{ href: "/cellar/en-tirage", label: "En Tirage", requires: "sparkling" }],
  },

  "/vineyards/field-notes": {
    label: "Vineyard sections",
    hubLabel: "Field notes",
    items: [
      { href: "/vineyards/maps", label: "Map Explorer", vineyard: true },
      { href: "/vineyards/weather", label: "Weather", vineyard: true },
      { href: "/vineyards/sprays", label: "Spray records", vineyard: true },
    ],
  },

  "/vineyards/harvest": {
    label: "Fruit intake sections",
    hubLabel: "Harvest",
    items: [{ href: "/vineyards/harvest/weigh-tags", label: "Weigh-tags", requires: "customCrush" }],
  },

  // D4 — Setup is a real hub page with grouped cards, not a tab strip. The legacy
  // `SETUP` sidebar group is the authority on what has to survive here; all eight
  // of its entries are present, and `test/nav-sections.test.ts` pins that.
  "/setup": {
    label: "Setup sections",
    hubLabel: "Setup",
    render: "cards",
    items: [
      { href: "/vessels", label: "Vessels", group: "Cellar", blurb: "Tanks, barrels and bins, and the groups they belong to." },
      { href: "/locations", label: "Locations", group: "Cellar", blurb: "Where wine, fruit and supplies physically live." },
      { href: "/reference", label: "Varieties & vineyards", group: "Reference data", blurb: "Varieties, vineyards, blocks and planting areas." },
      { href: "/setup/vendors", label: "Vendors", group: "Reference data", blurb: "Suppliers behind every invoice and purchase." },
      { href: "/setup/growers", label: "Growers", group: "Reference data", admin: true, blurb: "Who grew the fruit — estate blocks have growers too." },
      { href: "/setup/clients", label: "Clients", group: "Reference data", admin: true, requires: "customCrush", blurb: "Custom-crush owners whose wine you make." },
      { href: "/users", label: "Users", group: "People", admin: true, blurb: "Accounts, roles and vineyard assignments." },
      { href: "/settings", label: "Settings", group: "System", admin: true, blurb: "Programs, currency, units, time zone and integrations." },
    ],
  },
};

/**
 * Palette-only destinations (doc 01 §4).
 *
 * Two routes are reached by a control rather than by a link, so there is no nav
 * item to hang them on — but "no link" must never mean "no way in". Ctrl-K is the
 * documented entry point for both, and the palette applies the same role filter as
 * the sidebar, so this is not a back door.
 *
 * Keep this list SHORT. It is the one classification in the reachability guard that
 * a lazy answer could hide behind; every entry needs a reason a reviewer would accept.
 */
export const UTILITY_DESTINATIONS: SectionItem[] = [
  // The dock (AssistantDock) is mounted on every route and IS the supported surface;
  // the full page is the same chat without the page behind it.
  { href: "/assistant", label: "Assistant" },
  // Opened from inside an addition form, where the numbers are already in hand.
  { href: "/winemaking-calculator", label: "Calculator" },
];

/** Every hub href that has sub-navigation. */
export function sectionHubs(): string[] {
  return Object.keys(SECTIONS);
}

/** Every section ITEM across every hub, unfiltered. Used by the guards and the palette. */
export function allSectionItems(): (SectionItem & { hub: string })[] {
  return Object.entries(SECTIONS).flatMap(([hub, def]) => def.items.map((i) => ({ ...i, hub })));
}

/** Is this section item visible to the given role/membership/program set? */
export function isSectionVisible(item: SectionItem, ctx: SectionContext): boolean {
  if (item.requires === "sparkling" && !ctx.sparkling) return false;
  if (item.requires === "customCrush" && !ctx.customCrush) return false;
  // Delegate role/membership to the nav model's own predicate so the sidebar, the
  // sub-navs and the palette can never drift on what "admin-only" means.
  return isVisible({ href: item.href, label: item.label, admin: item.admin, vineyard: item.vineyard }, ctx);
}

/**
 * The parent name to show beside a section hit in the palette — or nothing.
 *
 * The subtitle is its own disclosure surface. `/vessels`, `/locations`, `/reference`
 * and `/setup/vendors` are open to every tenant user (their own pages say so) but
 * they live under `/setup`, which is admin-only; `/reports` is open but lives under
 * the admin-only `/accounting`. Printing "under Setup" would tell a plain user that
 * an admin-only destination named Setup exists — from a hit they are entitled to
 * see. So the HIT stays and the parent NAME drops.
 *
 * The other option was to gate each item on its hub's visibility, which is tidier to
 * state and costs those five surfaces their last route in: under v2 they have no nav
 * entry for a non-admin, so the palette is it.
 */
export function sectionParentLabel(hub: string, ctx: SectionContext): string | undefined {
  const dest = allDestinations().find((d) => d.href === hub);
  if (!dest) return SECTIONS[hub]?.hubLabel;
  return isVisible(dest, ctx) ? dest.label : undefined;
}

/**
 * The rendered sub-navigation for a hub: the hub's own self-link first, then its
 * visible items.
 *
 * The self-link matters. Without it a one-item strip reads as a button that throws
 * you out of the page you are on, with no way back except the sidebar.
 * Returns `[]` when the hub has no sub-navigation, or when every item is filtered
 * out — a strip containing only "you are here" is noise.
 */
export function sectionsFor(
  hub: string,
  ctx: SectionContext,
): { href: string; label: string }[] {
  const def = SECTIONS[hub];
  if (!def) return [];
  const visible = def.items.filter((i) => isSectionVisible(i, ctx));
  if (visible.length === 0) return [];
  return [{ href: hub, label: def.hubLabel }, ...visible.map((i) => ({ href: i.href, label: i.label }))];
}
