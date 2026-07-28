/**
 * Tank-board narrowing (v2 DM-41) — the board's own small filter model.
 *
 * Deliberately NOT a generalisation of Phase 5's `src/lib/work-orders/narrow.ts`. That module
 * is one release old and its `NarrowKind` union is work-order-specific (status, assignee,
 * template, …). Generalising a module to serve its second consumer, while the first consumer
 * is still settling, is the mistake doc 13 §88 warns about for the rail. When Phase 12 wants
 * one narrowing model it will have two real call sites to generalise from instead of one and
 * a guess.
 *
 * Pure — URL params in, filtered tiles and removable chips out. No React, no router, so it is
 * unit-testable under `environment: "node"`.
 */

import { TANK_STATES, TANK_STATE_LABEL, type TankState } from "./tank-state";

export type BoardFilters = {
  state: TankState | null;
  /** Free text matched against tank code, lot code and wine name. */
  q: string | null;
};

/** The minimum a tile must expose to be filtered. Keeps this module off the DTO. */
export type FilterableTile = {
  code: string;
  lotCodes: string[];
  wineName: string | null;
  state: TankState;
};

export type BoardChip = {
  key: keyof BoardFilters;
  label: string;
  /** The accessible name of the chip's remove control — never a bare "×". */
  removeLabel: string;
};

export const EMPTY_FILTERS: BoardFilters = { state: null, q: null };

function isTankState(v: string): v is TankState {
  return (TANK_STATES as readonly string[]).includes(v);
}

export function parseBoardFilters(params: Record<string, string | undefined>): BoardFilters {
  const rawState = (params.state ?? "").trim();
  const rawQ = (params.q ?? "").trim();
  return {
    // An unknown state param is dropped rather than thrown on: a stale bookmark should
    // show the whole board, not an error page.
    state: isTankState(rawState) ? rawState : null,
    q: rawQ.length > 0 ? rawQ : null,
  };
}

export function toQueryString(f: BoardFilters): string {
  const parts: string[] = [];
  if (f.state) parts.push(`state=${encodeURIComponent(f.state)}`);
  if (f.q) parts.push(`q=${encodeURIComponent(f.q)}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function hasAnyFilter(f: BoardFilters): boolean {
  return f.state != null || f.q != null;
}

function matchesQuery(t: FilterableTile, q: string): boolean {
  const needle = q.toLowerCase();
  if (t.code.toLowerCase().includes(needle)) return true;
  if (t.wineName != null && t.wineName.toLowerCase().includes(needle)) return true;
  return t.lotCodes.some((c) => c.toLowerCase().includes(needle));
}

export function applyBoardFilters<T extends FilterableTile>(tiles: T[], f: BoardFilters): T[] {
  return tiles.filter((t) => {
    if (f.state != null && t.state !== f.state) return false;
    if (f.q != null && !matchesQuery(t, f.q)) return false;
    return true;
  });
}

export function filterChips(f: BoardFilters): BoardChip[] {
  const chips: BoardChip[] = [];
  if (f.state) {
    chips.push({
      key: "state",
      label: TANK_STATE_LABEL[f.state],
      removeLabel: `Remove the ${TANK_STATE_LABEL[f.state].toLowerCase()} filter`,
    });
  }
  if (f.q) {
    chips.push({ key: "q", label: `"${f.q}"`, removeLabel: `Remove the search for ${f.q}` });
  }
  return chips;
}

export function withoutChip(f: BoardFilters, key: keyof BoardFilters): BoardFilters {
  return { ...f, [key]: null };
}

export function toggleState(f: BoardFilters, state: TankState): BoardFilters {
  return { ...f, state: f.state === state ? null : state };
}

function plural(n: number): string {
  return n === 1 ? "tank" : "tanks";
}

/**
 * The count line above the board. Says what was narrowed, in winery language, with the real
 * numbers (doc 09: "the summary sentence says what needs attention… It is never a slogan").
 */
export function resultSummary(count: number, total: number, f: BoardFilters): string {
  if (!hasAnyFilter(f)) return `${total} ${plural(total)}`;
  if (count === 0) {
    const terms = filterChips(f).map((c) => c.label.toLowerCase()).join(" · ");
    return `No tanks match ${terms}.`;
  }
  return `${count} of ${total} ${plural(total)}`;
}
