import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { GROUP_DONE_STATUSES } from "@/lib/work-orders/group-gating";

// Plan 053 A5: cross-order dependencies. An edge {workOrderId: A, dependsOnWorkOrderId: B} reads
// "A depends on B" — B must finish before A. Enforcement: WARN when a task in A starts (advisory), and
// HARD-BLOCK completing any task in A until every predecessor of A is worker-complete (all its tasks
// worker-completed). "Worker-complete" reuses GROUP_DONE_STATUSES (WORKORDER-1: a governed task is
// worker-done the instant its ledger op is written, before review). A CANCELLED predecessor is cleared.

export type DepEdge = { workOrderId: string; dependsOnWorkOrderId: string };

/** Can predecessor `to` already reach `from` by following depends-on edges? (Used for cycle detection.) */
function dependsOnReaches(edges: DepEdge[], start: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of edges) if (e.workOrderId === cur) stack.push(e.dependsOnWorkOrderId);
  }
  return false;
}

/** PURE: would adding `from → depends-on → to` create a self-loop or a cycle in the existing graph? */
export function wouldCreateCycle(edges: DepEdge[], from: string, to: string): boolean {
  if (from === to) return true;
  return dependsOnReaches(edges, to, from);
}

export type PredecessorWo = { number: number; status: string; taskStatuses: string[] };

/** PURE: given the predecessor WOs of a dependent order, return the ones that are NOT yet satisfied.
 * Satisfied = CANCELLED (cleared) OR every task is worker-complete. A predecessor with zero tasks is
 * treated as unsatisfied (nothing has been done yet) unless it was cancelled. */
export function unsatisfiedPredecessors(predecessors: PredecessorWo[]): PredecessorWo[] {
  return predecessors.filter((p) => {
    if (p.status === "CANCELLED") return false;
    if (p.taskStatuses.length === 0) return true;
    return !p.taskStatuses.every((s) => GROUP_DONE_STATUSES.has(s));
  });
}

/** Add a dependency edge (A depends on B). Cycle-check + insert in ONE tx (SF6) so concurrent adds can't
 * interleave into a loop. Rejects self-edges and cycles; the unique index makes a duplicate a no-op-ish
 * conflict surfaced as a friendly message. */
export async function addWorkOrderDependencyCore(
  actor: LedgerActor,
  input: { workOrderId: string; dependsOnWorkOrderId: string },
): Promise<{ id: string }> {
  if (input.workOrderId === input.dependsOnWorkOrderId) {
    throw new ActionError("A work order can't depend on itself.");
  }
  try {
    return await runInTenantTx(async (tx) => {
      const tenantId = requireTenantId();
      // Both WOs must exist in this tenant (RLS already scopes, but a clear error beats an FK 500).
      const found = await tx.workOrder.findMany({
        where: { id: { in: [input.workOrderId, input.dependsOnWorkOrderId] } },
        select: { id: true },
      });
      if (found.length < 2) throw new ActionError("One of those work orders no longer exists.");
      const edges = await tx.workOrderDependency.findMany({ select: { workOrderId: true, dependsOnWorkOrderId: true } });
      if (wouldCreateCycle(edges, input.workOrderId, input.dependsOnWorkOrderId)) {
        throw new ActionError("That would create a circular dependency between work orders.");
      }
      const row = await tx.workOrderDependency.create({
        data: {
          tenantId,
          workOrderId: input.workOrderId,
          dependsOnWorkOrderId: input.dependsOnWorkOrderId,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
        select: { id: true },
      });
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WorkOrderDependency", entityId: row.id, summary: `Added WO dependency ${input.workOrderId} → ${input.dependsOnWorkOrderId}` });
      return { id: row.id };
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      throw new ActionError("That dependency already exists.", "CONFLICT");
    }
    throw e;
  }
}

export async function removeWorkOrderDependencyCore(actor: LedgerActor, input: { id: string }): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const row = await tx.workOrderDependency.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!row) return { id: input.id }; // idempotent
    await tx.workOrderDependency.delete({ where: { id: input.id } });
    await writeAudit(tx, { ...actor, action: "DELETE", entityType: "WorkOrderDependency", entityId: input.id, summary: "Removed WO dependency" });
    return { id: input.id };
  });
}

/** Load the predecessor WOs of a dependent order with their task statuses (for gating + warnings). */
async function loadPredecessors(workOrderId: string): Promise<PredecessorWo[]> {
  const edges = await prisma.workOrderDependency.findMany({ where: { workOrderId }, select: { dependsOnWorkOrderId: true } });
  if (edges.length === 0) return [];
  const preds = await prisma.workOrder.findMany({
    where: { id: { in: edges.map((e) => e.dependsOnWorkOrderId) } },
    select: { number: true, status: true, tasks: { select: { status: true } } },
  });
  return preds.map((p) => ({ number: p.number, status: p.status, taskStatuses: p.tasks.map((t) => t.status) }));
}

/** HARD gate (called in the completion pre-flight): block completing a task in `workOrderId` until every
 * predecessor WO is worker-complete. Reversing a predecessor after a successor completed is handled by a
 * warning at reversal time (no cascade), not here. */
export async function assertPredecessorsDone(workOrderId: string): Promise<void> {
  const blocking = unsatisfiedPredecessors(await loadPredecessors(workOrderId));
  if (blocking.length > 0) {
    const list = blocking.map((p) => `WO #${p.number}`).join(", ");
    throw new ActionError(`Finish the prerequisite work order(s) first: ${list}.`);
  }
}

/** Advisory (UI): predecessor WO numbers that aren't done yet — surfaced as a WARN when starting work. */
export async function pendingPredecessorWarnings(workOrderId: string): Promise<string[]> {
  return unsatisfiedPredecessors(await loadPredecessors(workOrderId)).map((p) => `WO #${p.number} isn't finished yet`);
}
