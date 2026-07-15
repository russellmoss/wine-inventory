// Plan 069: the work-order Lead (WorkOrder.assigneeEmail + assigneeId) is a MANDATORY invariant — every
// order has exactly one accountable owner. Per-task assignees stay optional. These are the two pure
// decision functions behind that invariant, kept DB-free so they're unit-testable and reused by both the
// create chokepoint (createWorkOrderCore) and the one-time backfill (scripts/backfill-work-order-lead.ts).

import { ActionError } from "@/lib/action-error";

export type LeadRef = { assigneeId: string | null; assigneeEmail: string };

type ActorLike = { actorUserId: string | null; actorEmail: string };

/**
 * Resolve the effective Lead for a NEW work order. An explicit Lead (an email, optionally with a user id)
 * passes through untouched; otherwise the Lead defaults to the creating actor. This is what makes the
 * invariant hold across every creation path (builder, template, composer, recurring, assistant, generic)
 * from the single core chokepoint. Throws if neither an explicit email nor a usable actor email exists —
 * we never write a blank Lead.
 */
export function resolveCreateLead(
  input: { assigneeId?: string | null; assigneeEmail?: string | null },
  actor: ActorLike,
): LeadRef {
  const explicitEmail = input.assigneeEmail?.trim();
  if (explicitEmail) {
    return { assigneeId: input.assigneeId ?? null, assigneeEmail: explicitEmail };
  }
  const actorEmail = actor.actorEmail?.trim();
  if (actorEmail) {
    return { assigneeId: actor.actorUserId ?? null, assigneeEmail: actorEmail };
  }
  throw new ActionError("A work order needs a lead, and no lead was provided.");
}

/**
 * Resolve a Lead for an EXISTING Lead-less work order during backfill. Preference order, chosen to honor
 * the real intent captured at authoring time:
 *   1. the single distinct task assignee (an order whose one task points at a person → that person leads)
 *   2. the issuer (whoever issued the order)
 *   3. a fallback admin (the tenant's oldest admin — keeps the invariant true when there is no other signal)
 * Returns null only when there is no signal at all; the caller logs those for manual review rather than
 * guessing.
 */
export function resolveBackfillLead(input: {
  taskAssignees: { id: string | null; email: string | null }[];
  issuedBy: { id: string | null; email: string | null } | null;
  fallbackAdmin: { id: string | null; email: string | null } | null;
}): LeadRef | null {
  // Distinct task assignees by a stable key (id when present, else email).
  const distinct = new Map<string, { id: string | null; email: string | null }>();
  for (const a of input.taskAssignees) {
    const key = a.id ?? a.email;
    if (!key) continue;
    if (!distinct.has(key)) distinct.set(key, a);
  }
  if (distinct.size === 1) {
    const only = [...distinct.values()][0];
    if (only.email?.trim()) return { assigneeId: only.id ?? null, assigneeEmail: only.email.trim() };
  }
  if (input.issuedBy?.email?.trim()) {
    return { assigneeId: input.issuedBy.id ?? null, assigneeEmail: input.issuedBy.email.trim() };
  }
  if (input.fallbackAdmin?.email?.trim()) {
    return { assigneeId: input.fallbackAdmin.id ?? null, assigneeEmail: input.fallbackAdmin.email.trim() };
  }
  return null;
}
