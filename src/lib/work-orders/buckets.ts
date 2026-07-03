// Pure dashboard bucketing for work orders (Phase 9 Unit 13). No DB — unit-tested. Buckets an open WO
// by its due date relative to "now": overdue / today / upcoming / unscheduled. Terminal WOs (APPROVED,
// CANCELLED) are excluded by the caller; PENDING_APPROVAL is surfaced as its own review lane, not a
// due-date bucket.

export type DueBucket = "overdue" | "today" | "upcoming" | "unscheduled";

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Which due-date bucket a WO falls in, relative to `now` (local day boundaries). */
export function bucketFor(dueAt: Date | null | undefined, now: Date): DueBucket {
  if (!dueAt) return "unscheduled";
  const today0 = startOfDay(now);
  const due0 = startOfDay(dueAt);
  if (due0 < today0) return "overdue";
  if (due0 === today0) return "today";
  return "upcoming";
}

export type BucketedItem<T> = { overdue: T[]; today: T[]; upcoming: T[]; unscheduled: T[] };

/** Group items by their due-date bucket (preserves input order within each bucket). */
export function bucketWorkOrders<T extends { dueAt: Date | null }>(items: T[], now: Date): BucketedItem<T> {
  const out: BucketedItem<T> = { overdue: [], today: [], upcoming: [], unscheduled: [] };
  for (const it of items) out[bucketFor(it.dueAt, now)].push(it);
  return out;
}
