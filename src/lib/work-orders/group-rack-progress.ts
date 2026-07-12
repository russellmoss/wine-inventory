// Plan 054 (Phase 9.4b) Unit 1: derive per-member completion progress for a group-rack work-order task
// from its batch attempts. A group-rack task can now be completed in batches ("these 4 barrels now, the
// rest tomorrow"); each batch is a WorkOrderTaskAttempt whose actualPayload carries a `groupRackBatch`
// block recording which member vessels it completed. Completed members = the union of member vessel ids
// across the task's LIVE (non-rejected) batch attempts. This is a pure projection — no DB, no schema. It
// is the single source of truth for "what's left" on the execute screen, the completion core (when the
// last member lands the task leaves IN_PROGRESS), and per-batch LIFO reject.

export type GroupRackDirection = "BARREL_DOWN" | "RACK_TO_TANK";

/** The resolved group-rack block persisted on the task's plannedPayload (authored by NL/assistant). */
export type PlannedGroupRack = {
  direction?: string;
  sourceVesselId?: string;
  destVesselId?: string;
  destVesselIds?: string[];
  sourceVesselIds?: string[];
  memberCodes?: string[];
  [k: string]: unknown;
};

/** The per-batch record written onto a completion attempt's actualPayload (Unit 3). */
export type GroupRackBatchRecord = {
  memberVesselIds?: string[];
  operationId?: number | null;
};

/** Minimal attempt shape this projection needs (kept DB-free so it's unit-testable). */
export type BatchAttemptLite = {
  id: string;
  seq: number;
  status: string; // WorkOrderTaskAttemptStatus (REJECTED attempts are excluded)
  operationId?: number | null;
  groupRackBatch?: GroupRackBatchRecord | null;
};

export type GroupRackMemberProgress = {
  vesselId: string;
  code: string | null;
  done: boolean;
  byAttemptId?: string;
  byOperationId?: number | null;
};

export type GroupRackProgress = {
  direction: GroupRackDirection;
  members: GroupRackMemberProgress[];
  completedVesselIds: string[];
  pendingVesselIds: string[];
  allMembersDone: boolean;
  /** The most recent live batch attempt — the ONLY batch that may be rejected (LIFO). Null if none. */
  latestBatchAttemptId: string | null;
  batchCount: number;
};

function normalizeDirection(raw: unknown): GroupRackDirection {
  return raw === "RACK_TO_TANK" ? "RACK_TO_TANK" : "BARREL_DOWN";
}

/** The ordered member vessel ids for a planned group-rack (destinations for barrel-down, sources for rack-to-tank). */
export function groupRackMemberIds(planned: PlannedGroupRack): string[] {
  const dir = normalizeDirection(planned.direction);
  const raw = dir === "RACK_TO_TANK" ? planned.sourceVesselIds : planned.destVesselIds;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && !!x) : [];
}

/**
 * Derive per-member progress. `attempts` is every attempt on the task; REJECTED attempts are ignored so a
 * reversed batch's members return to pending. A live attempt with NO `groupRackBatch` is treated as a legacy
 * one-shot completion (pre-9.4b) that covered every member — so those tasks read as fully done.
 */
export function deriveGroupRackProgress(planned: PlannedGroupRack, attempts: BatchAttemptLite[]): GroupRackProgress {
  const direction = normalizeDirection(planned.direction);
  const memberIds = groupRackMemberIds(planned);
  if (memberIds.length === 0) {
    throw new Error("This group-rack task has no member vessels to complete.");
  }
  const codes = Array.isArray(planned.memberCodes) ? planned.memberCodes : [];
  const codeByVessel = new Map<string, string>();
  memberIds.forEach((id, i) => { if (typeof codes[i] === "string") codeByVessel.set(id, codes[i]); });

  const live = attempts.filter((a) => a.status !== "REJECTED");
  const liveBatches = live.filter((a) => a.groupRackBatch != null);
  const legacyFull = live.some((a) => a.groupRackBatch == null); // pre-9.4b one-shot completion

  // Map each completed member → the batch attempt that completed it (first live batch that lists it).
  const doneBy = new Map<string, { attemptId: string; operationId: number | null }>();
  if (legacyFull) {
    const owner = live.find((a) => a.groupRackBatch == null)!;
    for (const id of memberIds) doneBy.set(id, { attemptId: owner.id, operationId: owner.operationId ?? null });
  }
  for (const a of liveBatches) {
    const ids = Array.isArray(a.groupRackBatch?.memberVesselIds) ? a.groupRackBatch!.memberVesselIds! : [];
    const opId = a.groupRackBatch?.operationId ?? a.operationId ?? null;
    for (const id of ids) {
      if (!memberIds.includes(id)) continue; // ignore anything not a planned member
      if (!doneBy.has(id)) doneBy.set(id, { attemptId: a.id, operationId: opId });
    }
  }

  const members: GroupRackMemberProgress[] = memberIds.map((vesselId) => {
    const hit = doneBy.get(vesselId);
    return {
      vesselId,
      code: codeByVessel.get(vesselId) ?? null,
      done: !!hit,
      ...(hit ? { byAttemptId: hit.attemptId, byOperationId: hit.operationId } : {}),
    };
  });

  const completedVesselIds = members.filter((m) => m.done).map((m) => m.vesselId);
  const pendingVesselIds = members.filter((m) => !m.done).map((m) => m.vesselId);
  // LIFO reject target: the live batch attempt with the highest seq.
  const latestBatchAttemptId = liveBatches.length
    ? liveBatches.reduce((a, b) => (b.seq > a.seq ? b : a)).id
    : null;

  return {
    direction,
    members,
    completedVesselIds,
    pendingVesselIds,
    allMembersDone: pendingVesselIds.length === 0,
    latestBatchAttemptId,
    batchCount: liveBatches.length,
  };
}
