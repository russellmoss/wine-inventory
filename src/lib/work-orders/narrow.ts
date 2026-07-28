/**
 * SavedViews + Narrow — the replacement for the 7-field filter bar (v2 §B16).
 *
 * Pure: no React, no Prisma. The chip vocabulary, the URL round-trip and the
 * "what does removing this chip do" copy are all testable without a browser.
 *
 * ## Why the filter bar goes
 * It presents seven equal-weight fields and an Apply button, so the common case
 * ("what's mine, today") costs the same as the rare one. Saved views make the
 * common case one click; narrowing chips make the rare one incremental and, more
 * importantly, make the CURRENT state legible — a chip you can see and remove
 * beats a collapsed panel you have to open to find out what it is doing.
 *
 * ## Applies live, URL-synced, no Apply button
 * The URL is the state, so a narrowed queue is shareable and survives a reload.
 */

import type { StatusVariant } from "@/components/ui/status-variants";

export type NarrowKind = "status" | "assignee" | "location" | "template" | "from" | "to" | "q";

export interface NarrowChip {
  kind: NarrowKind;
  value: string;
  /** What the chip shows. */
  label: string;
}

export interface SavedView {
  id: string;
  label: string;
  /** Live count, filled by the caller. */
  hint?: string;
  params: Partial<Record<NarrowKind, string>>;
  tone?: StatusVariant;
}

/**
 * The built-in views. Ordered by how often a cellar hand actually wants them:
 * "Mine, today" is the first question of the morning, so it is the first chip.
 */
export function builtInViews(currentUserEmail: string | null): SavedView[] {
  return [
    {
      id: "mine-today",
      label: "Mine, today",
      params: currentUserEmail ? { assignee: currentUserEmail } : {},
      tone: "active",
    },
    { id: "unassigned", label: "Unassigned", params: { assignee: "none" }, tone: "attention" },
    { id: "review", label: "Needs review", params: { status: "PENDING_APPROVAL" }, tone: "review" },
    { id: "all-open", label: "All open", params: {}, tone: "neutral" },
  ];
}

const KIND_LABEL: Record<NarrowKind, string> = {
  status: "Status",
  assignee: "Assignee",
  location: "Location",
  template: "Template",
  from: "From",
  to: "To",
  q: "Matching",
};

/** Chips from the URL's search params, in a stable order. */
export function chipsFromParams(params: Record<string, string | undefined>): NarrowChip[] {
  const order: NarrowKind[] = ["q", "status", "assignee", "location", "template", "from", "to"];
  const out: NarrowChip[] = [];
  for (const kind of order) {
    const value = params[kind];
    if (!value) continue;
    out.push({ kind, value, label: `${KIND_LABEL[kind]}: ${humanise(kind, value)}` });
  }
  return out;
}

function humanise(kind: NarrowKind, value: string): string {
  if (kind === "assignee" && value === "none") return "nobody";
  if (kind === "status") return value.replace(/_/g, " ").toLowerCase();
  return value;
}

/**
 * A chip's accessible name states what REMOVING it does, not what it is (§B16).
 * "Status: issued" tells a screen-reader user nothing about the button they are
 * focused on; "Remove the status filter, showing all statuses" does.
 */
export function chipRemoveLabel(chip: NarrowChip): string {
  const widen: Record<NarrowKind, string> = {
    status: "showing every status",
    assignee: "showing every assignee",
    location: "showing every location",
    template: "showing every template",
    from: "removing the earliest date",
    to: "removing the latest date",
    q: "clearing the text search",
  };
  return `Remove ${KIND_LABEL[chip.kind].toLowerCase()} filter — ${widen[chip.kind]}`;
}

/** Drop one chip, returning the next param set. Pure, so the caller owns navigation. */
export function withoutChip(
  params: Record<string, string | undefined>,
  kind: NarrowKind,
): Record<string, string | undefined> {
  const next = { ...params };
  delete next[kind];
  return next;
}

/** Serialise to a query string, dropping empties so the URL stays readable. */
export function toQueryString(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Is this saved view the one currently applied? */
export function isViewActive(view: SavedView, params: Record<string, string | undefined>): boolean {
  const active = Object.entries(params).filter(([, v]) => Boolean(v));
  const want = Object.entries(view.params).filter(([, v]) => Boolean(v));
  if (active.length !== want.length) return false;
  return want.every(([k, v]) => params[k] === v);
}

/**
 * The result count sentence, announced in an `aria-live` region.
 *
 * Zero results is the case worth getting right: the old bar rendered a full
 * filter panel above an empty list, which reads as "the app is broken" rather
 * than "your narrowing excluded everything".
 */
export function resultSummary(count: number, chips: NarrowChip[]): string {
  if (count === 0) {
    return chips.length === 0
      ? "No open work orders."
      : `No work orders match these ${chips.length === 1 ? "filter" : "filters"}. Remove one to widen the search.`;
  }
  const noun = count === 1 ? "work order" : "work orders";
  return chips.length === 0 ? `${count} open ${noun}.` : `${count} ${noun} match.`;
}
