import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";

// ── Phase 9.3 Unit 5: hardened work-order dependency graph (PURE — no prisma, no server imports, so it is
// unit-tested directly). A dependency ref points at the STABLE proposal task key (uuid), never a mutable
// taskSeq, so it survives reordering, retries, drop-and-re-sign, and fanout. Completion-time resolution
// reads the predecessor's latest SUCCESSFUL attempt output — never model text or a plan-time assumption.

export type TaskDependencyRef = {
  kind: "task_output";
  /** The producing task's stable proposal-local key (TaskBuild.taskKey). */
  taskKey: string;
  /** Which output of the producer this ref names (e.g. "destLot", "destVessel", "operationId"). A producer
   *  with multiple outputs MUST be named explicitly; an ambiguous ref is a proposal-time error. */
  output: string;
};

export type TaskDependency = {
  /** The dependent task's stable key. */
  taskKey: string;
  needs: TaskDependencyRef[];
};

export type DependencyValidation = { ok: boolean; errors: string[] };

/** Every output name a producing task type can expose (used to reject an unknown/ambiguous ref name). */
export const KNOWN_OUTPUT_NAMES = new Set(["destLot", "destVessel", "sourceVessel", "operationId"]);

/**
 * Pure proposal-time validation: every task carries a key, every referenced key exists in the same
 * proposal, no self-reference, the graph is a DAG (no cycles), and every ref names a known output. This is
 * the gate that keeps a dependency ref from ever silently targeting the wrong (or a missing) task.
 */
export function validateDependencyGraph(taskBuilds: TaskBuild[], graph: TaskDependency[] | undefined): DependencyValidation {
  const errors: string[] = [];
  if (!graph || graph.length === 0) return { ok: true, errors };

  const keys = new Set<string>();
  for (const [i, tb] of taskBuilds.entries()) {
    if (!tb.taskKey) {
      errors.push(`Task #${i + 1} (${tb.taskType}) has no stable task key; dependencies require one.`);
      continue;
    }
    if (keys.has(tb.taskKey)) errors.push(`Duplicate task key "${tb.taskKey}".`);
    keys.add(tb.taskKey);
  }

  const adjacency = new Map<string, string[]>();
  for (const dep of graph) {
    if (!keys.has(dep.taskKey)) {
      errors.push(`Dependency references an unknown task "${dep.taskKey}".`);
      continue;
    }
    const edges: string[] = [];
    for (const ref of dep.needs) {
      if (ref.kind !== "task_output") {
        errors.push(`Unsupported dependency kind "${ref.kind}".`);
        continue;
      }
      if (!ref.output || !ref.output.trim()) errors.push(`Dependency of "${dep.taskKey}" is missing an output name.`);
      else if (!KNOWN_OUTPUT_NAMES.has(ref.output)) errors.push(`Dependency of "${dep.taskKey}" names an unknown output "${ref.output}".`);
      if (ref.taskKey === dep.taskKey) errors.push(`Task "${dep.taskKey}" cannot depend on itself.`);
      else if (!keys.has(ref.taskKey)) errors.push(`Dependency of "${dep.taskKey}" references an unknown task "${ref.taskKey}".`);
      else edges.push(ref.taskKey);
    }
    adjacency.set(dep.taskKey, [...(adjacency.get(dep.taskKey) ?? []), ...edges]);
  }

  if (hasCycle(adjacency)) errors.push("Dependency graph has a cycle; tasks cannot depend on each other in a loop.");

  return { ok: errors.length === 0, errors };
}

/** DFS cycle detection over the "depends-on" adjacency (dependent -> predecessor). */
function hasCycle(adjacency: Map<string, string[]>): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const visit = (node: string): boolean => {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  };
  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE && visit(node)) return true;
  }
  return false;
}

/**
 * Which KEPT tasks are orphaned when `droppedKeys` are removed (drop-and-re-sign, Unit 8): a kept task
 * whose dependency now points at a dropped predecessor. The caller drops/re-flags these so no ref ever
 * crosses out of the confirmed set.
 */
export function dependencyCascadeOnDrop(graph: TaskDependency[] | undefined, droppedKeys: Set<string>): { orphanedKeys: string[] } {
  const orphaned = new Set<string>();
  for (const dep of graph ?? []) {
    if (droppedKeys.has(dep.taskKey)) continue; // itself dropped
    if (dep.needs.some((ref) => droppedKeys.has(ref.taskKey))) orphaned.add(dep.taskKey);
  }
  return { orphanedKeys: [...orphaned] };
}

// ── Display-only simulated plan state (NEVER authoritative for a committed dose/capacity gate) ──

function num(v: unknown): number {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) || 0 : 0;
}

/**
 * Walk the ordered task builds accumulating planned volume deltas per vessel from volume-moving ops
 * (RACK/TOPPING). For UX/warning display only — the AUTHORITATIVE dose/capacity for a dependent task is
 * recomputed at completion against the predecessor's actual recorded output.
 */
export function simulatePlanState(taskBuilds: TaskBuild[]): Map<string, number> {
  const delta = new Map<string, number>();
  const add = (id: unknown, d: number) => {
    if (typeof id === "string" && id) delta.set(id, Math.round(((delta.get(id) ?? 0) + d) * 1e6) / 1e6);
  };
  for (const tb of taskBuilds) {
    const v = tb.values;
    if (tb.taskType === "RACK") {
      const drawL = num(v.drawL);
      const intoL = Math.max(0, drawL - num(v.lossL));
      if (drawL) add(v.fromVesselId, -drawL);
      if (intoL) add(v.toVesselId, intoL);
    } else if (tb.taskType === "TOPPING") {
      const volumeL = num(v.volumeL);
      if (volumeL) {
        add(v.fromVesselId, -volumeL);
        add(v.toVesselId, volumeL);
      }
    }
  }
  return delta;
}

// ── Completion-time resolution + state-machine gating (pure over injected attempt data) ──

export type AttemptOutcome = {
  seq: number;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  operationId: number | null;
};

export type PredecessorState = {
  taskKey: string;
  title: string;
  /** Canonical output columns of the producing task (mirrors WorkOrderTask). */
  destVesselId: string | null;
  lotId: string | null;
  isOperation: boolean; // OPERATION tasks must have written a ledger op; observations/maintenance need not
  attempts: AttemptOutcome[];
};

/** The latest attempt that actually produced output (highest seq, not REJECTED, with an op for OPERATION
 *  tasks). Retries resolve to this — never to a superseded/rejected attempt. */
export function latestSuccessfulAttempt(pred: PredecessorState): AttemptOutcome | null {
  const usable = pred.attempts
    .filter((a) => a.status !== "REJECTED" && (!pred.isOperation || a.operationId != null))
    .sort((a, b) => b.seq - a.seq);
  return usable[0] ?? null;
}

/** A predecessor is "complete" for gating once it has a latest successful attempt. */
export function isPredecessorComplete(pred: PredecessorState): boolean {
  return latestSuccessfulAttempt(pred) != null;
}

/**
 * State-machine gate: a dependent task is not completable until every predecessor it references has a
 * successful attempt. Throws a clear, winery-language error naming the blocking predecessor.
 */
export function assertDependenciesSatisfied(needs: TaskDependencyRef[], predecessorByKey: Map<string, PredecessorState>): void {
  for (const ref of needs) {
    const pred = predecessorByKey.get(ref.taskKey);
    if (!pred) throw new Error("This task depends on another task that is no longer in the work order.");
    if (!isPredecessorComplete(pred)) {
      throw new Error(`"${pred.title}" must be completed before this task can run.`);
    }
  }
}

/**
 * Resolve a dependency ref to the predecessor's actual produced output (completion-time). Gates on the
 * predecessor being complete, then reads its recorded output — never a plan-time assumption. An unknown
 * output name for the producer is a caller error (validated at proposal time).
 */
export function resolveProducedOutput(ref: TaskDependencyRef, pred: PredecessorState): { output: string; operationId: number | null; vesselId: string | null; lotId: string | null } {
  const attempt = latestSuccessfulAttempt(pred);
  if (!attempt) throw new Error(`"${pred.title}" has not produced its output yet.`);
  switch (ref.output) {
    case "operationId":
      return { output: ref.output, operationId: attempt.operationId, vesselId: null, lotId: null };
    case "destVessel":
    case "sourceVessel":
      return { output: ref.output, operationId: attempt.operationId, vesselId: pred.destVesselId, lotId: null };
    case "destLot":
      return { output: ref.output, operationId: attempt.operationId, vesselId: pred.destVesselId, lotId: pred.lotId };
    default:
      throw new Error(`Unknown dependency output "${ref.output}".`);
  }
}
