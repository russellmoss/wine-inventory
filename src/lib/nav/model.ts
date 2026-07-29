/**
 * The v2 navigation model — 3 groups, 13 global destinations (doc 01 §2).
 *
 * Pure data with no React, so the structure, the role matrix and the destination
 * count are unit-testable without a browser.
 *
 * Today's sidebar has **31** entries ordered by nothing in particular:
 * `Help / feedback` sits third while every daily cellar workflow is two clicks
 * deep inside a collapsed group. This orders by frequency of use, then by role.
 *
 * **Nothing is deleted.** Every destination that exists today still exists and
 * keeps its URL — 14 of them simply move out of the global sidebar and are
 * reached from the object they belong to, from a section sub-nav, or from search
 * (doc 01 §4). The route-stability test enforces that promise mechanically.
 */

export type NavRole = "user" | "admin" | "owner" | "developer";

export interface NavDestination {
  href: string;
  label: string;
  /** Old label, kept as a search alias for one release so muscle memory still finds it. */
  alias?: string;
  /** Admin-and-above only. */
  admin?: boolean;
  developer?: boolean;
  /** Needs vineyard membership OR admin. */
  vineyard?: boolean;
  /** Which live count rides this item, if any. */
  badge?: "workOrders" | "weighTags" | "compliance";
}

export interface NavGroup {
  id: "today" | "vineyards" | "wine" | "business";
  label: string;
  /** `business` is collapsed by default; the other three are open. */
  defaultOpen: boolean;
  items: NavDestination[];
}

export const NAV_MODEL: NavGroup[] = [
  {
    id: "today",
    label: "Today",
    defaultOpen: true,
    items: [
      { href: "/work-orders", label: "Work orders", badge: "workOrders" },
      { href: "/bulk", label: "Cellar floor", alias: "Wine in-progress" },
      // Fruit intake stays in Today, not in The vineyards: it is the moment fruit
      // BECOMES the winery's problem — weigh-tags, receiving, the crush pad — and it
      // is a daily job during harvest, which is what Today is ordered by.
      { href: "/vineyards/harvest", label: "Fruit intake", alias: "Harvest", badge: "weighTags" },
    ],
  },
  {
    // 2026-07-28 (owner): the vineyard is not a sub-tab of one destination, it is a
    // half of the business. Growing, and making wine from what you grew, are two
    // equal things, so they are two equal groups and this one sits FIRST — the fruit
    // exists before the wine does.
    //
    // This promotes Map Explorer, Weather & climate and Spray records from
    // sub-navigation of /vineyards/field-notes to destinations in their own right,
    // which is why NAV_MODEL is 16 and not the 13 Phase 3 shipped. The old 13 was
    // never a target in itself — 31 unordered entries was the problem, and four
    // named groups of four is still an IA you can hold in your head.
    id: "vineyards",
    label: "The vineyards",
    defaultOpen: true,
    items: [
      // "Vineyard rounds" through 2026-07-28, then briefly "Vineyards" — which
      // collided with the group name. "Scouting" is the actual job: walking the
      // blocks and recording what you see. The alias stays "Field notes", the LEGACY
      // sidebar label and the only one in anybody's muscle memory; the two interim
      // names never shipped outside this flag.
      { href: "/vineyards/field-notes", label: "Vineyard scouting", alias: "Field notes", vineyard: true },
      // Maps and Weather scope their vineyard picker by membership, so a non-member
      // would land on a working page with nothing in it — hide the link instead.
      { href: "/vineyards/maps", label: "Map Explorer", vineyard: true },
      { href: "/vineyards/weather", label: "Weather & climate", vineyard: true },
      // Spray records does NOT scope: it lists every active vineyard to any ready
      // user, so it is genuinely theirs and carries no flag.
      { href: "/vineyards/sprays", label: "Spray records" },
    ],
  },
  {
    id: "wine",
    label: "The wine",
    defaultOpen: true,
    items: [
      { href: "/lots", label: "Lots", alias: "Lot timeline" },
      // Created by Phase 3 — the handoff listed it as an existing destination
      // when only /ferment/crush, /press and /process existed.
      { href: "/ferment", label: "Fermentations" },
      { href: "/blend", label: "Blends & trials", admin: true },
      { href: "/bottling", label: "Bottling" },
      { href: "/inventory", label: "Inventory" },
    ],
  },
  {
    id: "business",
    label: "The business",
    defaultOpen: false,
    items: [
      { href: "/compliance", label: "Compliance", admin: true, badge: "compliance" },
      { href: "/accounting", label: "Accounting", admin: true },
      // OD-1: `Records` stays visible to every role. The handoff's role matrix and
      // the shipped code already agreed on this, so it is a ratification, not a change.
      { href: "/audit", label: "Records" },
      // Plan 104 D4 (OD-3b-1): this used to point at `/settings` — a page about
      // sparkling toggles and base currency, which is not what the label promises.
      // `/setup` is a new grouped index; `/settings` is now one of its eight children
      // (src/lib/nav/sections.ts). Nothing moved: /settings is still at /settings.
      // NOT `admin: true`, and that is a deliberate change from the entry it replaces.
      // `/settings` was admin-only and could be, because it is one admin screen. `/setup`
      // is a HUB, and four of its eight children — Vessels, Locations, Varieties &
      // vineyards, Vendors — are `requireActiveTenant()` only and sat UNGATED in the
      // legacy sidebar. Gating the hub would have taken all four away from the cellar
      // hand who uses them today, with Ctrl-K (desktop-only) as the sole fallback. The
      // hub is open; each child keeps its own guard and `sections.ts` filters the cards.
      { href: "/setup", label: "Setup" },
    ],
  },
];

/** Every global destination, flattened. */
export function allDestinations(): NavDestination[] {
  return NAV_MODEL.flatMap((g) => g.items);
}

/** Is this destination visible to the given role/membership? */
export function isVisible(
  d: NavDestination,
  ctx: { isAdmin: boolean; isDeveloper: boolean; hasVineyard: boolean },
): boolean {
  if (d.developer && !ctx.isDeveloper) return false;
  if (d.admin && !ctx.isAdmin) return false;
  if (d.vineyard && !ctx.hasVineyard && !ctx.isAdmin) return false;
  return true;
}

/** Search aliases for the four renames, so muscle memory still lands. */
export function aliasMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of allDestinations()) if (d.alias) out[d.alias.toLowerCase()] = d.href;
  return out;
}
