// Minimal, replaceable approval authority (Phase 9 Unit 7 — decision 2). There is NO role tier between
// admin and user today; the full RBAC capability matrix is Phase 23. v1: an ADMIN approves, and a WO
// flagged autoFinalize finalizes self-executed work at completion (no double-keying by the same admin).
// This is a pure function so Phase 23 can swap the policy without touching the cores.

export type ApproverUser = { id: string; role: string | null };

export type ApprovalDecision = { ok: true } | { ok: false; reason: string };

/** Can this user approve/reject work-order tasks? v1: admins only. */
export function canApprove(user: ApproverUser): ApprovalDecision {
  if (user.role === "admin") return { ok: true };
  return { ok: false, reason: "Only an admin can approve work-order tasks." };
}

/** Should a just-completed OPERATION task finalize immediately (skip the review queue)? v1: only when
 * the WO is flagged autoFinalize AND the person completing it can approve (an admin doing their own
 * work). Anyone else's completion always goes to PENDING_APPROVAL for a maker-checker review. */
export function shouldAutoFinalize(user: ApproverUser, wo: { autoFinalize: boolean }): boolean {
  return wo.autoFinalize && canApprove(user).ok;
}
