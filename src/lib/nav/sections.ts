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
  /**
   * Admin-and-above only.
   *
   * The contract is **at least as strict as the page it points at, never looser** —
   * and only the "never looser" half is a bug, so only that half is enforced
   * (`test/nav-section-guards.test.ts` reads each target `page.tsx` and fails if an
   * unflagged item points at a page that turns non-admins away). An earlier draft of
   * this comment claimed the flags *mirror* the guards, which was simply untrue:
   * `/settings` and `/work-orders/task-types` are flagged admin while their pages
   * admit any tenant user, deliberately — one exposes QuickBooks and Commerce7
   * connection config, the other is an authoring surface. Being stricter costs a
   * discoverability path; being looser is a dead link or a leak.
   */
  admin?: boolean;
  /**
   * Needs vineyard membership OR admin.
   *
   * Also a deliberate over-restriction: `/vineyards/maps` and `/vineyards/weather`
   * do not GATE on membership, they scope their vineyard picker by it — so a
   * non-member who followed the link would land on a working page with an empty
   * picker. Linking someone to a guaranteed-empty screen is worse than not linking
   * them. `/vineyards/sprays` carries no flag precisely because it does NOT scope:
   * it lists every active vineyard to any ready user, so it is genuinely theirs.
   */
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
  /**
   * NOTE: there is deliberately no `hubLabel`. The self-link takes its name from
   * the hub's own `NAV_MODEL` destination, so the sidebar, the strip and Ctrl-K
   * cannot call the same page three different things. An earlier draft invented
   * "Open work" / "Sync status" / "Bottling runs" here, and — worse — put back
   * "Field notes" and "Harvest", the two labels doc 01 §5 RETIRED in favour of
   * "Vineyard rounds" and "Fruit intake" (they survive only as search aliases,
   * `model.ts` `aliasMap`). The strip sat directly under a sidebar showing the new
   * name, undoing the rename on the one screen it applies to.
   *
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
    items: [
      { href: "/work-orders/review", label: "Review", admin: true },
      { href: "/work-orders/templates", label: "Templates" },
      { href: "/work-orders/task-types", label: "Task types", admin: true },
    ],
  },

  "/lots": {
    label: "Lot sections",
    items: [{ href: "/samples", label: "Samples" }],
  },

  // `/bulk` and `/inventory` carry one section each, and BOTH exist because of a
  // role trap that the first draft walked straight into: an ungated page parked
  // under an admin-only hub is unreachable for everyone else. Doc 01 §4 filed
  // Reports under Accounting, but `/accounting` is `admin: true` and `/reports` is
  // `requireActiveTenant()` only — and its own `h1` reads "Inventory reports". It is
  // an inventory surface. Same story for the calculator, whose doc-01 entry point
  // ("any addition form") does not exist in source; Ctrl-K alone is a desktop-only
  // answer, and a cellar hand on a phone has no Ctrl key.
  "/bulk": {
    label: "Cellar floor sections",
    items: [{ href: "/winemaking-calculator", label: "Calculator" }],
  },

  "/inventory": {
    label: "Inventory sections",
    items: [{ href: "/reports", label: "Reports" }],
  },

  "/bottling": {
    label: "Bottling sections",
    // The En Tirage worklist 404s when the sparkling program is off (K14), so the
    // link has to disappear with it or the tab is a trap.
    items: [{ href: "/cellar/en-tirage", label: "En Tirage", requires: "sparkling" }],
  },

  "/vineyards/field-notes": {
    label: "Vineyard sections",
    items: [
      // Maps and Weather scope their vineyard list by membership, so a non-member
      // lands on an empty page — hiding the link is the honest thing to do.
      { href: "/vineyards/maps", label: "Map Explorer", vineyard: true },
      { href: "/vineyards/weather", label: "Weather & climate", vineyard: true },
      // Spray records does NOT scope (page.tsx:14 lists every active vineyard to any
      // ready user), so it carries no flag. Gating it would take a surface away from
      // the cellar hand who had it in the legacy sidebar and give nothing back: the
      // hub above it is vineyard-gated either way, so this only decides whether
      // Ctrl-K can still find it. It can.
      { href: "/vineyards/sprays", label: "Spray records" },
    ],
  },

  "/vineyards/harvest": {
    label: "Fruit intake sections",
    items: [{ href: "/vineyards/harvest/weigh-tags", label: "Weigh-tags", requires: "customCrush" }],
  },

  // D4 — Setup is a real hub page with grouped cards, not a tab strip. The legacy
  // `SETUP` sidebar group is the authority on what has to survive here; all eight
  // of its entries are present, and `test/nav-sections.test.ts` pins that.
  "/setup": {
    label: "Setup sections",
    render: "cards",
    items: [
      { href: "/vessels", label: "Vessels", group: "Cellar", blurb: "Tanks, barrels and bins, and the groups they belong to." },
      { href: "/locations", label: "Locations", group: "Cellar", blurb: "Where wine, fruit and supplies physically live." },
      { href: "/reference", label: "Varieties & vineyards", group: "Vineyards & partners", blurb: "Varieties, vineyards, blocks and planting areas." },
      { href: "/setup/vendors", label: "Vendors", group: "Vineyards & partners", blurb: "Suppliers behind every invoice and purchase." },
      { href: "/setup/growers", label: "Growers", group: "Vineyards & partners", admin: true, blurb: "Who grew the fruit — estate blocks have growers too." },
      { href: "/setup/clients", label: "Clients", group: "Vineyards & partners", admin: true, requires: "customCrush", blurb: "Custom-crush owners whose wine you make." },
      { href: "/users", label: "Users", group: "People & system", admin: true, blurb: "Accounts, roles and vineyard assignments." },
      { href: "/settings", label: "Settings", group: "People & system", admin: true, blurb: "Programs, currency, units, time zone and integrations." },
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
  // `AssistantDock` mounts a fixed "Ask" button on EVERY route, phone included, and
  // that button — not this route — is the supported way to the assistant (CLAUDE.md
  // says so outright). `/assistant` is the same chat with no page behind it, kept
  // until the dock fully retires it. So this entry is a convenience, not the only
  // way in, which is the only reason a desktop-only Ctrl-K path is acceptable here.
  { href: "/assistant", label: "Assistant" },
];

/**
 * The hub a route belongs to, if any.
 *
 * Lets the sidebar mark the PARENT current while the user is on one of its
 * sections. Without it, the v2 sidebar shows no current item at all on any of the
 * ~19 section routes — stand on `/vessels` or `/settings` and nothing anywhere says
 * where you are. `startsWith` handles the section routes that nest (`/vessels/x`)
 * without letting `/lots` claim `/lots-archive`.
 */
export function hubForRoute(pathname: string): string | undefined {
  for (const [hub, def] of Object.entries(SECTIONS)) {
    if (def.items.some((i) => i.href === pathname || pathname.startsWith(`${i.href}/`))) return hub;
  }
  return undefined;
}

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
 * Scope, stated honestly: this hides the parent's name from the RENDERED palette.
 * `SECTIONS` itself is imported by `AppShell.tsx`, a client component, so the whole
 * record — labels, `admin` flags and all — ships in the JS bundle to every signed-in
 * browser regardless of role. That is the pre-existing shape of `NAV_MODEL` too, and
 * it is static route structure rather than tenant data. So this is about not putting
 * an admin-only name in front of someone in the UI; it is NOT a claim that the route
 * table is secret.
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
  // Fail CLOSED on an unknown hub. Every key is a global destination today (pinned
  // in test/nav-sections.test.ts), so this branch is unreachable — but the default
  // arm of a disclosure gate returns nothing, never an unfiltered label.
  if (!dest) return undefined;
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
  // The self-link is named by the hub's own destination, never by a second label
  // kept here — see the note on SectionDef.
  const self = allDestinations().find((d) => d.href === hub);
  if (!self) return [];
  return [{ href: hub, label: self.label }, ...visible.map((i) => ({ href: i.href, label: i.label }))];
}
