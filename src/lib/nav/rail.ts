/**
 * The collapsible sidebar's persisted preference (doc 13).
 *
 * Pure logic, no React, so the four conditions that make an icon rail legitimate
 * rather than a regression are testable without a browser.
 *
 * doc 13 §3 — all four are MANDATORY:
 *   1. Expanded is the DEFAULT. A new or seasonal user never meets the rail
 *      unless they choose it. Never a server default, never set by an admin for
 *      someone else.
 *   2. The label is always the accessible name in BOTH states. The tooltip is
 *      never the accessible name.
 *   3. Tooltips answer to keyboard focus, not just hover, and Esc dismisses them
 *      without moving focus.
 *   4. Desktop only. Below 1024px there is no rail and no hamburger — the four
 *      labelled tabs stand. No phone user ever meets an unlabelled icon.
 */

/** Per user, per tenant, per device (doc 13 §3.1). */
export function railStorageKey(tenantId: string, userId: string): string {
  return `cellarhand.rail.${tenantId}.${userId}`;
}

/** Expanded unless the user has explicitly chosen the rail on THIS device. */
export function readRailPreference(raw: string | null): boolean {
  return raw === "collapsed";
}

export function serialiseRailPreference(collapsed: boolean): string {
  return collapsed ? "collapsed" : "expanded";
}

/** Announced once in an aria-live region on toggle (doc 13 §4). */
export function railAnnouncement(collapsed: boolean): string {
  return collapsed ? "Sidebar collapsed." : "Sidebar expanded.";
}

/** The control's accessible name flips with state; `aria-expanded` carries the state. */
export function railToggleLabel(collapsed: boolean): string {
  return collapsed ? "Expand the sidebar" : "Collapse the sidebar";
}

/**
 * A rail item's accessible name — IDENTICAL in both states, with the badge count
 * folded in when collapsed, because the visible pill becomes a bare dot
 * (doc 13 §3.2 and AC-S35).
 */
export function railItemLabel(label: string, badge?: number): string {
  return badge && badge > 0 ? `${label}, ${badge} open` : label;
}

/** Ctrl-\ toggles the rail. Matches Cmd too, but the UI only ever says Ctrl. */
export function isRailToggleShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.key === "\\" && (e.metaKey || e.ctrlKey);
}
