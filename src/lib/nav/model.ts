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
  id: "today" | "wine" | "business";
  label: string;
  /** `business` is collapsed by default; the other two are open. */
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
      { href: "/vineyards/field-notes", label: "Vineyard rounds", alias: "Field notes", vineyard: true },
      { href: "/vineyards/harvest", label: "Fruit intake", alias: "Harvest", badge: "weighTags" },
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
