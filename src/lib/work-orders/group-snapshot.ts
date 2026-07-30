import type { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { vesselLabel } from "@/lib/cellar/addition";

// Cellarhand v2 Phase 7 (plan 106, Unit 6) — GROUP-3: an issued work order's member list is frozen.
//
// "No membership edit — add, remove, reorder, split, merge, archive, or retroactive admin correction
// — may change what an already-issued work order covers."
//
// This exists because RFC-001 originally proposed effective-dated membership with historical reads
// re-deriving as-of the work order's date. Combined with §4.9's retroactive membership correction,
// that reproduces exactly the failure SPRAY-2 forbids: a correction silently repaints what a closed
// decision meant. The snapshot makes it STRUCTURALLY IMPOSSIBLE rather than merely forbidden, which
// is strictly stronger than a copy-verbatim rule that correction code has to keep honouring.

/** One frozen member. `position` is the walk order AS IT WAS at issue, not as it is now. */
export type FrozenMember = {
  vesselId: string;
  code: string;
  label: string;
  position: number;
};

export type MemberSnapshot = {
  /** Bumped only if the shape changes; a reader must never guess at an unversioned blob. */
  v: 1;
  groupId: string;
  /** The group's name AT ISSUE. Renaming the group later must not repaint the worksheet. */
  groupName: string;
  members: FrozenMember[];
};

/** The four cases of D3, named so the read path can say which one it took rather than imply it. */
export type MemberSource = "frozen" | "live" | "literal";

export type TaskMemberView = {
  source: MemberSource;
  members: FrozenMember[];
  groupId: string | null;
  groupName: string | null;
  frozenAt: string | null;
};

/** Narrow a persisted Json blob back to a snapshot, refusing anything that isn't one. */
export function parseMemberSnapshot(raw: Prisma.JsonValue | null | undefined): MemberSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Partial<MemberSnapshot>;
  if (o.v !== 1 || typeof o.groupId !== "string" || !Array.isArray(o.members)) return null;
  return o as MemberSnapshot;
}

/**
 * The member list a work-order task's payload already carries, for the `vesselGroupId: null` case.
 * `groupRack` uses destVesselIds/sourceVesselIds by direction; `groupActivity` uses memberVesselIds.
 * Both carry a parallel `memberCodes`.
 */
export function literalMembersFromPayload(payload: Prisma.JsonValue | null | undefined): FrozenMember[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const p = payload as Record<string, unknown>;
  const block = (p.groupRack ?? p.groupActivity) as Record<string, unknown> | undefined;
  if (!block || typeof block !== "object") return [];
  const ids = (block.memberVesselIds ?? block.destVesselIds ?? block.sourceVesselIds) as unknown;
  const codes = block.memberCodes as unknown;
  if (!Array.isArray(ids)) return [];
  const codeList = Array.isArray(codes) ? codes : [];
  return ids.map((id, i) => {
    const code = typeof codeList[i] === "string" ? (codeList[i] as string) : "";
    return { vesselId: String(id), code, label: code ? `Barrel ${code}` : String(id), position: i + 1 };
  });
}

/**
 * D3 in one function. Which list a task reports, and from where:
 *
 *  - a FROZEN snapshot exists            -> "frozen". Any non-DRAFT status. Immutable.
 *  - `vesselGroupId` set, still DRAFT    -> "live". Nothing has been committed to, so the draft
 *                                          re-resolves current membership on every read. The builder
 *                                          says so in words: "the list is fixed when you issue."
 *  - `vesselGroupId` null                -> "literal". Membership was always a literal list; the
 *                                          payload list IS the snapshot, frozen at authoring.
 *
 * Note the order: the snapshot wins even over DRAFT. A work order cannot go back to DRAFT after being
 * issued, but if one ever could, a frozen list must not thaw.
 */
export function resolveTaskMembers(
  task: {
    vesselGroupId: string | null;
    memberSnapshot: Prisma.JsonValue | null;
    memberSnapshotAt: Date | null;
    plannedPayload: Prisma.JsonValue;
  },
  liveMembers: FrozenMember[] | null,
  liveGroupName: string | null,
): TaskMemberView {
  const frozen = parseMemberSnapshot(task.memberSnapshot);
  if (frozen) {
    return {
      source: "frozen",
      members: frozen.members,
      groupId: frozen.groupId,
      groupName: frozen.groupName,
      frozenAt: task.memberSnapshotAt ? task.memberSnapshotAt.toISOString() : null,
    };
  }
  if (task.vesselGroupId) {
    return {
      source: "live",
      members: liveMembers ?? [],
      groupId: task.vesselGroupId,
      groupName: liveGroupName,
      frozenAt: null,
    };
  }
  return {
    source: "literal",
    members: literalMembersFromPayload(task.plannedPayload),
    groupId: null,
    groupName: null,
    frozenAt: null,
  };
}

/** True when this payload carries a barrel-group member set (either shape). */
export function payloadHasGroupBlock(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  const block = p.groupRack ?? p.groupActivity;
  return !!(block && typeof block === "object" && !Array.isArray(block));
}

/**
 * Rewrite a task payload's member arrays so they match the frozen snapshot.
 *
 * Returns null when the payload carries no group block (nothing to reconcile). Only the member id and
 * code arrays are touched — direction, drawL, lossL, activityType, doses and every other planned input
 * are left exactly as authored.
 */
export function reconcilePayloadToSnapshot(
  payload: Prisma.JsonValue | null,
  snapshot: MemberSnapshot,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = { ...(payload as Record<string, unknown>) };
  const ids = snapshot.members.map((m) => m.vesselId);
  const codes = snapshot.members.map((m) => m.code);

  const rack = p.groupRack;
  if (rack && typeof rack === "object" && !Array.isArray(rack)) {
    const r = { ...(rack as Record<string, unknown>) };
    // Barrel-down writes the members as DESTINATIONS; rack-to-tank writes them as SOURCES. Replace
    // whichever key this task actually uses, never both — writing the absent one would invent a leg.
    if (Array.isArray(r.destVesselIds)) r.destVesselIds = ids;
    if (Array.isArray(r.sourceVesselIds)) r.sourceVesselIds = ids;
    r.memberCodes = codes;
    p.groupRack = r;
    return p;
  }

  const activity = p.groupActivity;
  if (activity && typeof activity === "object" && !Array.isArray(activity)) {
    const a = { ...(activity as Record<string, unknown>) };
    a.memberVesselIds = ids;
    a.memberCodes = codes;
    p.groupActivity = a;
    return p;
  }
  return null;
}

/**
 * Freeze every group-backed task on a work order. Called INSIDE `issueWorkOrderCore`'s transaction,
 * between the DRAFT->ISSUED flip and the reservations, so the freeze and the status change commit
 * together or not at all.
 *
 * Refusals (D3, and these are judgement calls worth naming):
 *  - ARCHIVED group -> refused. RFC-001 §4.5 protects work orders ALREADY ISSUED; a draft has not
 *    committed to anything, so issuing against a group someone has retired is a mistake, not history.
 *  - EMPTY group -> refused. A group task with zero members is meaningless — it would issue a
 *    worksheet with nothing on it and report success.
 */
export async function freezeGroupSnapshotsTx(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  now: Date,
): Promise<number> {
  const tasks = await tx.workOrderTask.findMany({
    where: { workOrderId, vesselGroupId: { not: null }, memberSnapshotAt: null },
    select: { id: true, title: true, vesselGroupId: true, plannedPayload: true },
  });
  if (tasks.length === 0) return 0;

  const groupIds = [...new Set(tasks.map((t) => t.vesselGroupId!))];
  const groups = await tx.vesselGroup.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true,
      name: true,
      status: true,
      members: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { position: true, vessel: { select: { id: true, code: true, type: true } } },
      },
    },
  });
  const byId = new Map(groups.map((g) => [g.id, g]));

  let frozen = 0;
  for (const task of tasks) {
    const g = byId.get(task.vesselGroupId!);
    if (!g) {
      throw new ActionError(
        `"${task.title}" points at a barrel group that no longer exists. Edit the task before issuing.`,
        "CONFLICT",
      );
    }
    if (g.status === "ARCHIVED") {
      throw new ActionError(
        `Can't issue: "${task.title}" is against the archived group "${g.name}". Restore the group, or point the task somewhere else.`,
        "CONFLICT",
      );
    }
    if (g.members.length === 0) {
      throw new ActionError(
        `Can't issue: the group "${g.name}" has no barrels in it, so "${task.title}" would cover nothing.`,
        "CONFLICT",
      );
    }

    const snapshot: MemberSnapshot = {
      v: 1,
      groupId: g.id,
      groupName: g.name,
      members: g.members.map((m, i) => ({
        vesselId: m.vessel.id,
        code: m.vessel.code,
        label: vesselLabel(m.vessel),
        // Renumbered 1..N at freeze rather than copied: the snapshot must be internally consistent
        // even if live positions had drifted non-contiguous.
        position: i + 1,
      })),
    };

    // THE PAYLOAD IS RECONCILED TO THE SNAPSHOT, and this is what makes GROUP-3 real rather than
    // decorative.
    //
    // The first version of this wrote `memberSnapshot` and stopped there — and NOTHING IN THE PRODUCT
    // READ IT. The worksheet, the execute form and the completion path all build their member list
    // from `plannedPayload.groupRack` / `.groupActivity` (see buildGroupRackViews in data.ts). So the
    // frozen list was never shown and never executed; the crew worked whatever was in the payload.
    // That is exactly the F3 failure this phase was written to fix, reproduced one level up: an
    // invariant enforced on a column no surface consults is a green check over a no-op.
    //
    // Rather than rewire every read path, the freeze now makes the payload AGREE with the snapshot.
    // The list the crew executes IS the frozen list, through the surface that already exists. Paired
    // with updateWorkOrderCore's refusal to edit a frozen task's payload, the member list of an issued
    // work order genuinely cannot change.
    const reconciled = reconcilePayloadToSnapshot(task.plannedPayload, snapshot);

    // `updateMany` with `memberSnapshotAt: null` in the WHERE makes the write ONCE-ONLY at the
    // database, not by prior inspection. Two concurrent issues cannot both write a snapshot.
    const written = await tx.workOrderTask.updateMany({
      where: { id: task.id, memberSnapshotAt: null },
      data: {
        memberSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        memberSnapshotAt: now,
        ...(reconciled ? { plannedPayload: reconciled as Prisma.InputJsonValue } : {}),
      },
    });
    frozen += written.count;
  }
  return frozen;
}
