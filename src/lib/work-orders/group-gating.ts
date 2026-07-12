// Plan 053 A3: the PURE decision behind sequential-group gating (unit-tested here; the DB query lives in
// actions.ts). A work order is an ordered set of groups; tasks in the same `groupSeq` run in parallel, and
// a task may complete only once EVERY task in a LOWER group is "worker-completed". Positional — it never
// references a specific task row/taskKey — so a rejected-and-reissued predecessor keeps its group open
// until it is redone, with no dependency-edge bookkeeping.

/** Task statuses that count as "the worker finished this step". A GOVERNED task reaches PENDING_APPROVAL
 * the instant its immutable ledger op is written (WORKORDER-1), so it is worker-done even before review.
 * SKIPPED clears the step. REJECTED / PENDING / IN_PROGRESS do NOT. */
export const GROUP_DONE_STATUSES: ReadonlySet<string> = new Set([
  "PENDING_APPROVAL",
  "APPROVED",
  "DONE",
  "SKIPPED",
]);

export type GroupGatingTask = { title: string; seq: number; status: string; groupSeq: number };

/**
 * Given the task's own group index and its sibling tasks, return the first earlier-group task that is not
 * yet worker-completed (the one that blocks completion), or null if the task is free to complete.
 * Only tasks in a STRICTLY LOWER group gate; same-group tasks are parallel and never block each other.
 */
export function firstBlockingPriorTask(myGroupSeq: number, siblings: GroupGatingTask[]): GroupGatingTask | null {
  if (myGroupSeq <= 0) return null; // first group has nothing before it
  const blocking = siblings
    .filter((t) => t.groupSeq < myGroupSeq && !GROUP_DONE_STATUSES.has(t.status))
    .sort((a, b) => a.seq - b.seq);
  return blocking[0] ?? null;
}
