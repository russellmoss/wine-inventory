import type { Prisma, VesselGroupStatus, VesselGroupType } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { diff, writeAudit } from "@/lib/audit";
import { vesselLabel } from "@/lib/cellar/addition";
import { OPEN_STATUSES } from "@/lib/work-orders/archive-filters";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Cellarhand v2 Phase 7 (RFC-001, plan 106 Unit 4) — the group as a configurable operational object:
// type, status, location, settings, member ORDER, archive-with-warning, and audit that records
// before/after rather than a sentence.
//
// WHY THIS IS A `*-core.ts` FILE AND THE OLD CRUD IS NOT (plan 106 D5, resolving F8). `verify:ai-native`
// discovers a "core" only when the FILE PATH matches `*-core.ts` AND it exports a symbol ending in
// `Core`. `src/lib/vessels/groups.ts` matches neither, so it is invisible to the gate — the existing
// group CRUD has never been assessed for assistant coverage, and an INTERNAL entry naming it would be
// a stale key and a hard CI failure.
//
// Landing this here makes it DISCOVERED, which means the exemption has to be written down in
// `scripts/ai-native-allowlist.mjs` instead of being an accident of a filename. Group configuration is
// desk-with-coffee work, not wet-hands work: you sit down once and define a rack. That is a real
// exemption, and it belongs on the record. Silence is not an exemption.

/** RFC-001 §4.4 — group settings are DEFAULTS FOR GENERATED WORK ORDERS, never a live constraint. */
export type VesselGroupSettings = {
  /** Days between toppings, used to propose the next round. Never blocks an early or late topping. */
  toppingIntervalDays?: number;
  /** Preferred source vessel (a keg) for topping this group. */
  toppingSourceVesselId?: string;
  /** Target free SO2 in mg/L for the group's additions. */
  so2TargetMgL?: number;
  /** Free-text sampling rule ("one barrel in six, rotating"). */
  samplingRule?: string;
  /** Default crew / assignee email for work orders generated against this group. */
  defaultCrewEmail?: string;
};

export type VesselGroupMemberDTO = {
  id: string;
  vesselId: string;
  code: string;
  type: string;
  label: string;
  position: number;
};

export type VesselGroupDetailDTO = {
  id: string;
  name: string;
  note: string | null;
  type: VesselGroupType;
  status: VesselGroupStatus;
  locationId: string | null;
  locationName: string | null;
  rackLabel: string | null;
  settings: VesselGroupSettings;
  createdAt: string;
  members: VesselGroupMemberDTO[];
};

function parseSettings(raw: Prisma.JsonValue | null): VesselGroupSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as VesselGroupSettings;
}

// `satisfies`, not `as const` — `as const` makes the orderBy tuple readonly and Prisma's generated
// args type is mutable, so the include no longer assigns.
//
// No `location` relation: `locationId` is a PLAIN SCALAR ref with its composite tenant FK in raw SQL
// (K11), matching WorkOrderTask.locationId. So the hall name is resolved in a second query rather
// than joined, which is also what keeps the group index to two queries instead of a join per row.
const GROUP_INCLUDE = {
  members: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { vessel: { select: { id: true, code: true, type: true } } },
  },
} satisfies Prisma.VesselGroupInclude;

type GroupRow = Prisma.VesselGroupGetPayload<{ include: typeof GROUP_INCLUDE }>;

function toDetail(g: GroupRow, locationName: string | null): VesselGroupDetailDTO {
  return {
    id: g.id,
    name: g.name,
    note: g.note,
    type: g.type,
    status: g.status,
    locationId: g.locationId,
    locationName,
    rackLabel: g.rackLabel,
    settings: parseSettings(g.settings),
    createdAt: g.createdAt.toISOString(),
    members: g.members.map((m) => ({
      id: m.id,
      vesselId: m.vessel.id,
      code: m.vessel.code,
      type: m.vessel.type,
      label: vesselLabel({ type: m.vessel.type, code: m.vessel.code }),
      position: m.position,
    })),
  };
}

/** Resolve the hall names for a set of groups in one query (see GROUP_INCLUDE on why it isn't a join). */
async function locationNames(groups: { locationId: string | null }[]): Promise<Map<string, string>> {
  const ids = [...new Set(groups.map((g) => g.locationId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** One group with its ordered members, or null. Reads ARCHIVED groups too — the detail page shows them. */
export async function getGroupDetailCore(groupId: string): Promise<VesselGroupDetailDTO | null> {
  const g = await prisma.vesselGroup.findUnique({ where: { id: groupId }, include: GROUP_INCLUDE });
  if (!g) return null;
  const names = await locationNames([g]);
  return toDetail(g, g.locationId ? (names.get(g.locationId) ?? null) : null);
}

/** The group index. `status` defaults to ACTIVE because archived groups are hidden from pickers (§4.5). */
export async function listGroupDetailsCore(
  opts: { status?: VesselGroupStatus | "ALL" } = {},
): Promise<VesselGroupDetailDTO[]> {
  const status = opts.status ?? "ACTIVE";
  const groups = await prisma.vesselGroup.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { name: "asc" },
    include: GROUP_INCLUDE,
  });
  const names = await locationNames(groups);
  return groups.map((g) => toDetail(g, g.locationId ? (names.get(g.locationId) ?? null) : null));
}

// ── rollups (Unit 7) ─────────────────────────────────────────────────────────────────────────────

/**
 * RFC-001 §4.6 / AC-10: COMPUTED, NEVER STORED.
 *
 * Every figure here states its derivation, because they are not the same KIND of number and the UI
 * must not present them as if they were. `volumeL` is a sum of DERIVED barrel volumes — a ledger
 * projection, not a measurement — so per DESIGN.md it is rendered "≈ estimated", never "measured".
 * `lotCodes` is what makes the two-wines warning row possible (SC-09's Partial state: legal, not an
 * error). `oldestLastToppedAt` is null when nothing in the group has ever been topped, which is a
 * different fact from "topped a long time ago" and must not collapse into one.
 */
export type GroupRollups = {
  memberCount: number;
  lotCodes: string[];
  distinctLotCount: number;
  volumeL: number;
  capacityL: number;
  oldestLastToppedAt: string | null;
  /** Null when the group has members but NONE has ever been topped — absence, not staleness. */
  neverToppedCount: number;
  openWorkOrderCount: number;
};

export async function getGroupRollupsCore(groupId: string): Promise<GroupRollups> {
  const members = await prisma.vesselGroupMember.findMany({
    where: { groupId },
    select: {
      vesselId: true,
      vessel: {
        select: {
          capacityL: true,
          vesselLots: { select: { volumeL: true, lot: { select: { code: true } } } },
        },
      },
    },
  });

  const vesselIds = members.map((m) => m.vesselId);
  const lotCodes = new Set<string>();
  let volumeL = 0;
  let capacityL = 0;
  for (const m of members) {
    capacityL += Number(m.vessel.capacityL ?? 0);
    for (const vl of m.vessel.vesselLots) {
      volumeL += Number(vl.volumeL ?? 0);
      lotCodes.add(vl.lot.code);
    }
  }

  // Last topped, per vessel, from the ledger — TOPPING legs against these vessels.
  //
  // `distinct` + `orderBy` rather than `groupBy`: the date lives on LotOperation (`observedAt` — WHEN
  // IT HAPPENED, not when it was typed in), and a groupBy cannot reach through the relation to
  // aggregate it. Prisma's distinct-with-orderBy keeps this ONE row per vessel, so a 420-barrel
  // group does not drag every topping line it ever had across the wire.
  const lastToppedRows =
    vesselIds.length === 0
      ? []
      : await prisma.lotOperationLine.findMany({
          where: { vesselId: { in: vesselIds }, operation: { type: "TOPPING" } },
          orderBy: { operation: { observedAt: "desc" } },
          distinct: ["vesselId"],
          select: { vesselId: true, operation: { select: { observedAt: true } } },
        });

  const topped = lastToppedRows.map((r) => r.operation.observedAt).filter((d): d is Date => d instanceof Date);
  const oldest = topped.length > 0 ? topped.reduce((a, b) => (a < b ? a : b)) : null;

  return {
    memberCount: members.length,
    lotCodes: [...lotCodes].sort(),
    distinctLotCount: lotCodes.size,
    volumeL: Math.round(volumeL * 100) / 100,
    capacityL: Math.round(capacityL * 100) / 100,
    // Only meaningful once EVERY member has been topped at least once. While some never have, the
    // oldest topping date would understate the group's true worst case.
    oldestLastToppedAt: oldest && topped.length === members.length ? oldest.toISOString() : null,
    neverToppedCount: members.length - topped.length,
    openWorkOrderCount: await countOpenWorkOrdersForGroup(groupId),
  };
}

// ── configuration ────────────────────────────────────────────────────────────────────────────────

export type ConfigureGroupInput = {
  groupId: string;
  name?: string;
  note?: string | null;
  type?: VesselGroupType;
  locationId?: string | null;
  rackLabel?: string | null;
  settings?: VesselGroupSettings;
};

/**
 * Set any of name / note / type / location / settings in one call, with a real before/after audit.
 *
 * F7: the six existing group audit writes in `groups.ts` are summary-only — none passes `changes`,
 * even though RFC-001 AC-8 requires actor AND before/after and `diff()` has existed since the audit
 * module shipped. A sentence tells you something changed; it does not tell you what it was.
 */
export async function configureGroupCore(
  actor: LedgerActor,
  input: ConfigureGroupInput,
): Promise<VesselGroupDetailDTO> {
  const before = await prisma.vesselGroup.findUnique({ where: { id: input.groupId } });
  if (!before) throw new ActionError("Group not found.");

  const data: Prisma.VesselGroupUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ActionError("Give the group a name.");
    if (name.length > 80) throw new ActionError("Group name is too long.");
    const clash = await prisma.vesselGroup.findFirst({ where: { name }, select: { id: true } });
    if (clash && clash.id !== input.groupId) throw new ActionError(`A group named "${name}" already exists.`);
    data.name = name;
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null;
  if (input.type !== undefined) data.type = input.type;
  if (input.rackLabel !== undefined) data.rackLabel = input.rackLabel?.trim() || null;
  if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;

  if (input.locationId !== undefined) {
    if (input.locationId === null) {
      data.locationId = null;
    } else {
      const loc = await prisma.location.findUnique({ where: { id: input.locationId }, select: { id: true } });
      // The composite tenant FK would reject a cross-tenant id anyway (and the tenant extension keeps
      // this lookup scoped, so another tenant's location reads as missing). This turns a raw
      // constraint error into a sentence a person can act on.
      if (!loc) throw new ActionError("That location doesn't exist.");
      data.locationId = input.locationId;
    }
  }

  // Retyping a group to OPERATIONAL can collide with GROUP-1 through the propagation trigger — the
  // members' `groupType` flips and the partial unique index fires. Catch it here so the message names
  // the vessel and the other group instead of surfacing a constraint name.
  if (input.type === "OPERATIONAL" && before.type !== "OPERATIONAL") {
    const conflict = await findOperationalConflictForGroup(input.groupId);
    if (conflict) {
      throw new ActionError(
        `Can't make this an operational group: ${conflict.vesselLabel} is already in "${conflict.groupName}".`,
        "CONFLICT",
      );
    }
  }

  await runInTenantTx(async (tx) => {
    const after = await tx.vesselGroup.update({ where: { id: input.groupId }, data });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselGroup",
      entityId: input.groupId,
      changes: diff(auditShape(before), auditShape(after)),
      summary: `Updated vessel group "${after.name}"`,
    });
  });

  const dto = await getGroupDetailCore(input.groupId);
  if (!dto) throw new ActionError("Group vanished after update.");
  return dto;
}

/** The fields worth recording before/after. Excludes derived/bookkeeping columns that add only noise. */
function auditShape(g: {
  name: string;
  note: string | null;
  type: VesselGroupType;
  status: VesselGroupStatus;
  locationId: string | null;
  rackLabel: string | null;
  settings: Prisma.JsonValue | null;
}): Record<string, unknown> {
  return {
    name: g.name,
    note: g.note,
    type: g.type,
    status: g.status,
    locationId: g.locationId,
    rackLabel: g.rackLabel,
    settings: g.settings === null ? null : JSON.stringify(g.settings),
  };
}

// ── archive ──────────────────────────────────────────────────────────────────────────────────────

export type ArchiveGroupResult = {
  status: VesselGroupStatus;
  /** Open work orders that reference this group. Archiving does NOT affect them (§4.5) — they carry
   *  their own frozen member list (GROUP-3). Surfaced so the confirmation copy can say so. */
  openWorkOrderCount: number;
};

/**
 * Archive or restore. RFC-001 §4.5: archiving hides the group from pickers and indexes, keeps all
 * history, and does not touch open work orders.
 *
 * `confirmOpenWorkOrders` is the warn-then-proceed gate. It is a WARNING, not a block: the invariant
 * that protects issued work orders is GROUP-3's snapshot, not this check, and refusing here would be
 * theatre that implies the snapshot doesn't work.
 */
export async function archiveGroupCore(
  actor: LedgerActor,
  input: { groupId: string; archived: boolean; confirmOpenWorkOrders?: boolean },
): Promise<ArchiveGroupResult> {
  const group = await prisma.vesselGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new ActionError("Group not found.");

  const openWorkOrderCount = await countOpenWorkOrdersForGroup(input.groupId);
  const nextStatus: VesselGroupStatus = input.archived ? "ARCHIVED" : "ACTIVE";

  if (input.archived && openWorkOrderCount > 0 && !input.confirmOpenWorkOrders) {
    throw new ActionError(
      `"${group.name}" is referenced by ${openWorkOrderCount} open work order${openWorkOrderCount === 1 ? "" : "s"}. ` +
        `Archiving hides the group but does not change those work orders — their barrel lists are already frozen. Confirm to archive.`,
      "CONFLICT",
    );
  }

  if (group.status !== nextStatus) {
    await runInTenantTx(async (tx) => {
      const after = await tx.vesselGroup.update({ where: { id: input.groupId }, data: { status: nextStatus } });
      await writeAudit(tx, {
        ...actor,
        action: input.archived ? "DELETE" : "UPDATE",
        entityType: "VesselGroup",
        entityId: input.groupId,
        changes: diff(auditShape(group), auditShape(after)),
        summary: input.archived
          ? `Archived vessel group "${group.name}"`
          : `Restored vessel group "${group.name}"`,
      });
    });
  }

  return { status: nextStatus, openWorkOrderCount };
}

// ── membership ───────────────────────────────────────────────────────────────────────────────────

/**
 * Add a vessel at the end of the walk order.
 *
 * The OD-3 catch is the point of this function. A bare unique-violation from the partial index says
 * `vessel_group_member_one_operational_group_per_vessel` — SC-09's validation state needs the NAME of
 * the group the barrel is already in, so it is looked up and put in the message.
 */
export async function addGroupMemberCore(
  actor: LedgerActor,
  input: { groupId: string; vesselId: string },
): Promise<VesselGroupDetailDTO> {
  const [group, vessel] = await Promise.all([
    prisma.vesselGroup.findUnique({ where: { id: input.groupId } }),
    prisma.vessel.findUnique({ where: { id: input.vesselId }, select: { id: true, code: true, type: true } }),
  ]);
  if (!group) throw new ActionError("Group not found.");
  if (group.status === "ARCHIVED") throw new ActionError("That group is archived. Restore it before editing membership.");
  if (!vessel) throw new ActionError("Vessel not found.");

  const already = await prisma.vesselGroupMember.findFirst({
    where: { groupId: input.groupId, vesselId: input.vesselId },
    select: { id: true },
  });
  if (already) return (await getGroupDetailCore(input.groupId))!;

  // Pre-flight so the common case gets the good message. The DB index is still the enforcement — the
  // check-then-insert below has a race, and the unique violation is caught as the backstop.
  if (group.type === "OPERATIONAL") {
    const conflict = await findOperationalConflictForVessel(input.vesselId);
    if (conflict) {
      throw new ActionError(
        `${vesselLabel(vessel)} is already in the operational group "${conflict.groupName}". Remove it from there first.`,
        "CONFLICT",
      );
    }
  }

  try {
    await runInTenantTx(async (tx) => {
      const max = await tx.vesselGroupMember.aggregate({
        where: { groupId: input.groupId },
        _max: { position: true },
      });
      await tx.vesselGroupMember.create({
        data: { groupId: input.groupId, vesselId: input.vesselId, position: (max._max.position ?? 0) + 1 },
      });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "VesselGroup",
        entityId: input.groupId,
        changes: { members: { from: `-${vesselLabel(vessel)}`, to: `+${vesselLabel(vessel)}` } },
        summary: `Added ${vesselLabel(vessel)} to vessel group "${group.name}"`,
      });
    });
  } catch (e) {
    // Lost the race against a concurrent add. Same message, so the two paths are indistinguishable
    // to the user.
    if (isUniqueViolation(e)) {
      const conflict = await findOperationalConflictForVessel(input.vesselId);
      throw new ActionError(
        conflict
          ? `${vesselLabel(vessel)} is already in the operational group "${conflict.groupName}". Remove it from there first.`
          : `${vesselLabel(vessel)} is already in this group.`,
        "CONFLICT",
      );
    }
    throw e;
  }

  return (await getGroupDetailCore(input.groupId))!;
}

/** Remove a vessel and close the gap in the walk order, so positions stay contiguous (§4.3). */
export async function removeGroupMemberCore(
  actor: LedgerActor,
  input: { groupId: string; vesselId: string },
): Promise<VesselGroupDetailDTO> {
  const [group, vessel] = await Promise.all([
    prisma.vesselGroup.findUnique({ where: { id: input.groupId } }),
    prisma.vessel.findUnique({ where: { id: input.vesselId }, select: { id: true, code: true, type: true } }),
  ]);
  if (!group) throw new ActionError("Group not found.");
  if (!vessel) throw new ActionError("Vessel not found.");

  await runInTenantTx(async (tx) => {
    const removed = await tx.vesselGroupMember.deleteMany({
      where: { groupId: input.groupId, vesselId: input.vesselId },
    });
    if (removed.count === 0) return;
    await renumberTx(tx, input.groupId);
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselGroup",
      entityId: input.groupId,
      changes: { members: { from: `+${vesselLabel(vessel)}`, to: `-${vesselLabel(vessel)}` } },
      summary: `Removed ${vesselLabel(vessel)} from vessel group "${group.name}"`,
    });
  });

  return (await getGroupDetailCore(input.groupId))!;
}

/**
 * Reorder the walk. `vesselIds` is the new order; any member omitted keeps its relative place at the
 * end, so a partial list from a drag-and-drop can't silently drop members.
 *
 * Positions are rewritten to 1..N contiguously — RFC-001 §4.3 says contiguous, and a crew resuming
 * "barrel 10 of 22" mid-round needs that to be literally true.
 */
export async function reorderGroupMembersCore(
  actor: LedgerActor,
  input: { groupId: string; vesselIds: string[] },
): Promise<VesselGroupDetailDTO> {
  const group = await prisma.vesselGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new ActionError("Group not found.");

  const members = await prisma.vesselGroupMember.findMany({
    where: { groupId: input.groupId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, vesselId: true, position: true },
  });
  if (members.length === 0) throw new ActionError("That group has no members to reorder.");

  const byVessel = new Map(members.map((m) => [m.vesselId, m]));
  const seen = new Set<string>();
  const ordered: { id: string; vesselId: string }[] = [];
  for (const vesselId of input.vesselIds) {
    const m = byVessel.get(vesselId);
    if (!m) throw new ActionError("That vessel isn't in this group.");
    if (seen.has(vesselId)) throw new ActionError("The same vessel appears twice in the new order.");
    seen.add(vesselId);
    ordered.push(m);
  }
  for (const m of members) if (!seen.has(m.vesselId)) ordered.push(m);

  const beforeOrder = members.map((m) => m.vesselId).join(",");
  const afterOrder = ordered.map((m) => m.vesselId).join(",");
  if (beforeOrder === afterOrder) return (await getGroupDetailCore(input.groupId))!;

  await runInTenantTx(async (tx) => {
    // Two passes through a negative offset. Positions carry no unique index today, but a single pass
    // that walks 1..N over rows currently holding 1..N is the shape that breaks the moment one is
    // added — and reordering is exactly when you'd add it.
    for (let i = 0; i < ordered.length; i++) {
      await tx.vesselGroupMember.update({ where: { id: ordered[i].id }, data: { position: -(i + 1) } });
    }
    for (let i = 0; i < ordered.length; i++) {
      await tx.vesselGroupMember.update({ where: { id: ordered[i].id }, data: { position: i + 1 } });
    }
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselGroup",
      entityId: input.groupId,
      changes: { memberOrder: { from: beforeOrder, to: afterOrder } },
      summary: `Reordered ${ordered.length} member${ordered.length === 1 ? "" : "s"} in vessel group "${group.name}"`,
    });
  });

  return (await getGroupDetailCore(input.groupId))!;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function renumberTx(tx: Prisma.TransactionClient, groupId: string): Promise<void> {
  const rows = await tx.vesselGroupMember.findMany({
    where: { groupId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (let i = 0; i < rows.length; i++) {
    await tx.vesselGroupMember.update({ where: { id: rows[i].id }, data: { position: i + 1 } });
  }
}

/** The OPERATIONAL group a vessel is already in, if any — the name SC-09's validation state needs. */
async function findOperationalConflictForVessel(
  vesselId: string,
): Promise<{ groupId: string; groupName: string } | null> {
  const row = await prisma.vesselGroupMember.findFirst({
    where: { vesselId, groupType: "OPERATIONAL" },
    select: { groupId: true, group: { select: { name: true } } },
  });
  return row ? { groupId: row.groupId, groupName: row.group.name } : null;
}

/** The first member of `groupId` that already sits in a DIFFERENT operational group. */
async function findOperationalConflictForGroup(
  groupId: string,
): Promise<{ vesselLabel: string; groupName: string } | null> {
  const members = await prisma.vesselGroupMember.findMany({
    where: { groupId },
    select: { vesselId: true, vessel: { select: { code: true, type: true } } },
  });
  for (const m of members) {
    const conflict = await prisma.vesselGroupMember.findFirst({
      where: { vesselId: m.vesselId, groupType: "OPERATIONAL", groupId: { not: groupId } },
      select: { group: { select: { name: true } } },
    });
    if (conflict) return { vesselLabel: vesselLabel(m.vessel), groupName: conflict.group.name };
  }
  return null;
}

/**
 * Work orders in a non-terminal status carrying a task against this group.
 *
 * Reuses the canonical `OPEN_STATUSES` rather than re-listing them. A local list would drift the
 * moment a status is added, and this count is what the archive confirmation copy is built on.
 */
export async function countOpenWorkOrdersForGroup(groupId: string): Promise<number> {
  return prisma.workOrder.count({
    where: {
      status: { in: [...OPEN_STATUSES] },
      tasks: { some: { vesselGroupId: groupId } },
    },
  });
}
