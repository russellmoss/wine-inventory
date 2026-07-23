// Pure dashboard bucketing for work orders (Phase 9 Unit 13). No DB — unit-tested. Buckets an open WO
// by its due date relative to "now": overdue / today / upcoming / unscheduled. Terminal WOs (APPROVED,
// CANCELLED) are excluded by the caller; PENDING_APPROVAL is surfaced as its own review lane, not a
// due-date bucket.

import { zonedDateKey } from "./due-at";

export type DueBucket = "overdue" | "today" | "upcoming" | "unscheduled";

/**
 * Which due-date bucket a WO falls in, relative to `now`, using the WINERY's day boundaries.
 *
 * `timeZone` matters more than it looks. This used to call `d.getFullYear()/getMonth()/getDate()`,
 * which is SERVER-local — i.e. UTC in production. A work order due 9pm Eastern is 01:00Z the next day,
 * so it landed in "upcoming" while the crew was standing in the cellar on the evening it was due.
 * Comparing zone-local date keys instead makes the lanes agree with the calendar the winery works on.
 * Unset (undefined) keeps the previous server-local behaviour for callers that have no zone to offer.
 */
export function bucketFor(dueAt: Date | null | undefined, now: Date, timeZone?: string): DueBucket {
  if (!dueAt) return "unscheduled";
  const today0 = dayKey(now, timeZone);
  const due0 = dayKey(dueAt, timeZone);
  if (due0 < today0) return "overdue";
  if (due0 === today0) return "today";
  return "upcoming";
}

/** A sortable `YYYY-MM-DD` for the given zone (server-local when none is given). */
function dayKey(d: Date, timeZone?: string): string {
  if (!timeZone) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return zonedDateKey(d, timeZone);
}

export type BucketedItem<T> = { overdue: T[]; today: T[]; upcoming: T[]; unscheduled: T[] };

/** Group items by their due-date bucket (preserves input order within each bucket). */
export function bucketWorkOrders<T extends { dueAt: Date | null }>(
  items: T[],
  now: Date,
  timeZone?: string,
): BucketedItem<T> {
  const out: BucketedItem<T> = { overdue: [], today: [], upcoming: [], unscheduled: [] };
  for (const it of items) out[bucketFor(it.dueAt, now, timeZone)].push(it);
  return out;
}
