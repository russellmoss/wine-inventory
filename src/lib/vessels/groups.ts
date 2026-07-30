import { ActionError } from "@/lib/action-error";
import { requireTenantId } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Script-safe CRUD for vessel groups (Phase 3, Unit 7). VesselGroup / VesselGroupMember
// have existed since the spine (D13) with zero code using them — this is their first use.
// Cellar group actions (group-apply.ts) fan one operation out across a group's members.
// cellar/actions.ts wraps these as server actions; scripts call the cores directly.

export type VesselRef = { id: string; code: string; type: string; label: string };
export type VesselGroupDTO = {
  id: string;
  name: string;
  note: string | null;
  isActive: boolean;
  members: VesselRef[];
};

function label(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

/** Active groups with their member vessels, ordered by name. */
export async function listGroups(): Promise<VesselGroupDTO[]> {
  const groups = await prisma.vesselGroup.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { members: { include: { vessel: { select: { id: true, code: true, type: true } } } } },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    note: g.note,
    isActive: g.isActive,
    members: g.members
      .map((m) => ({ id: m.vessel.id, code: m.vessel.code, type: m.vessel.type, label: label(m.vessel) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  }));
}

export async function createGroupCore(
  actor: LedgerActor,
  input: { name: string; note?: string; vesselIds?: string[] },
): Promise<VesselGroupDTO> {
  const name = input.name?.trim();
  if (!name) throw new ActionError("Give the group a name.");
  if (name.length > 80) throw new ActionError("Group name is too long.");
  const existing = await prisma.vesselGroup.findFirst({ where: { name } });
  if (existing) {
    if (!existing.isActive) {
      await prisma.vesselGroup.update({ where: { id: existing.id }, data: { isActive: true } });
    } else {
      throw new ActionError(`A group named "${name}" already exists.`);
    }
  }
  const vesselIds = [...new Set(input.vesselIds ?? [])];

  // GROUP-1/OD-3. `createMany({ skipDuplicates: true })` below emits ON CONFLICT DO NOTHING, which is
  // UNQUALIFIED — it matches ANY unique index, including the new partial
  // `vessel_group_member_one_operational_group_per_vessel`. Left alone, saving a 22-barrel selection
  // where 6 barrels already sit in another operational group would silently create a 16-member group,
  // report success, and let the audit summary claim 22. A correctness index must never be absorbed by
  // ON CONFLICT DO NOTHING. Every group created here is OPERATIONAL, so this is the ordinary path.
  const conflicts = vesselIds.length
    ? await prisma.vesselGroupMember.findMany({
        where: { vesselId: { in: vesselIds }, groupType: "OPERATIONAL" },
        select: { vessel: { select: { code: true, type: true } }, group: { select: { name: true } } },
      })
    : [];
  if (conflicts.length > 0) {
    const named = conflicts.slice(0, 3).map((c) => `${label(c.vessel)} (in "${c.group.name}")`).join(", ");
    const more = conflicts.length > 3 ? ` and ${conflicts.length - 3} more` : "";
    throw new ActionError(
      `${conflicts.length === 1 ? "That vessel is" : "Those vessels are"} already in another operational barrel group: ${named}${more}. Remove ${conflicts.length === 1 ? "it" : "them"} first, or leave ${conflicts.length === 1 ? "it" : "them"} out of this group.`,
      "CONFLICT",
    );
  }

  const group = await runInTenantTx(async (tx) => {
    const g = existing
      ? await tx.vesselGroup.update({ where: { id: existing.id }, data: { note: input.note?.trim() || null } })
      : await tx.vesselGroup.create({ data: { name, note: input.note?.trim() || null } });
    if (vesselIds.length > 0) {
      await tx.vesselGroupMember.createMany({
        data: vesselIds.map((vesselId) => ({ groupId: g.id, vesselId })),
        skipDuplicates: true,
      });
    }
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "VesselGroup",
      entityId: g.id,
      summary: `Created vessel group "${name}" (${vesselIds.length} member${vesselIds.length === 1 ? "" : "s"})`,
    });
    return g;
  });

  const dto = await getGroup(group.id);
  if (!dto) throw new ActionError("Group vanished after create.");
  return dto;
}

export async function renameGroupCore(actor: LedgerActor, groupId: string, name: string): Promise<void> {
  const trimmed = name?.trim();
  if (!trimmed) throw new ActionError("Give the group a name.");
  const group = await prisma.vesselGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new ActionError("Group not found.");
  const clash = await prisma.vesselGroup.findFirst({ where: { name: trimmed } });
  if (clash && clash.id !== groupId) throw new ActionError(`A group named "${trimmed}" already exists.`);
  await runInTenantTx(async (tx) => {
    await tx.vesselGroup.update({ where: { id: groupId }, data: { name: trimmed } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselGroup",
      entityId: groupId,
      summary: `Renamed vessel group to "${trimmed}"`,
    });
  });
}

export async function deactivateGroupCore(actor: LedgerActor, groupId: string): Promise<void> {
  const group = await prisma.vesselGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new ActionError("Group not found.");
  await runInTenantTx(async (tx) => {
    await tx.vesselGroup.update({ where: { id: groupId }, data: { isActive: false } });
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "VesselGroup",
      entityId: groupId,
      summary: `Deactivated vessel group "${group.name}"`,
    });
  });
}

export async function addMemberCore(actor: LedgerActor, groupId: string, vesselId: string): Promise<void> {
  const [group, vessel] = await Promise.all([
    prisma.vesselGroup.findUnique({ where: { id: groupId } }),
    prisma.vessel.findUnique({ where: { id: vesselId } }),
  ]);
  if (!group) throw new ActionError("Group not found.");
  if (!group.isActive) throw new ActionError("That group is inactive.");
  if (!vessel) throw new ActionError("Vessel not found.");
  await runInTenantTx(async (tx) => {
    await tx.vesselGroupMember.upsert({
      where: { tenantId_groupId_vesselId: { tenantId: requireTenantId(), groupId, vesselId } },
      create: { groupId, vesselId },
      update: {},
    });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselGroup",
      entityId: groupId,
      summary: `Added ${label(vessel)} to vessel group "${group.name}"`,
    });
  });
}

export async function removeMemberCore(actor: LedgerActor, groupId: string, vesselId: string): Promise<void> {
  const [group, vessel] = await Promise.all([
    prisma.vesselGroup.findUnique({ where: { id: groupId } }),
    prisma.vessel.findUnique({ where: { id: vesselId } }),
  ]);
  if (!group) throw new ActionError("Group not found.");
  if (!vessel) throw new ActionError("Vessel not found.");
  await runInTenantTx(async (tx) => {
    const removed = await tx.vesselGroupMember.deleteMany({ where: { groupId, vesselId } });
    if (removed.count > 0) {
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "VesselGroup",
        entityId: groupId,
        summary: `Removed ${label(vessel)} from vessel group "${group.name}"`,
      });
    }
  });
}

export async function mergeGroupMembershipCore(
  actor: LedgerActor,
  input: { sourceGroupId: string; targetGroupId: string; deactivateSource?: boolean },
): Promise<VesselGroupDTO> {
  if (input.sourceGroupId === input.targetGroupId) throw new ActionError("Pick two different groups to merge.");
  const [source, target, sourceMembers] = await Promise.all([
    prisma.vesselGroup.findUnique({ where: { id: input.sourceGroupId } }),
    prisma.vesselGroup.findUnique({ where: { id: input.targetGroupId } }),
    prisma.vesselGroupMember.findMany({ where: { groupId: input.sourceGroupId }, select: { vesselId: true } }),
  ]);
  if (!source) throw new ActionError("Source group not found.");
  if (!target) throw new ActionError("Target group not found.");
  if (!source.isActive || !target.isActive) throw new ActionError("Only active groups can be merged.");

  await runInTenantTx(async (tx) => {
    if (sourceMembers.length > 0) {
      // GROUP-1/OD-3: a MERGE between two OPERATIONAL groups is the worst case for
      // `createMany({ skipDuplicates: true })`. Every member of the source is, by definition, already
      // in an operational group (the source), so ON CONFLICT DO NOTHING would drop EVERY row — and
      // then `deactivateSource` (default true) archives the source anyway. Net effect: target
      // unchanged, source archived and no longer editable, audit log cheerfully reporting "merged 22
      // members". MOVE the rows instead of inserting copies: one UPDATE satisfies the index at commit
      // because each vessel still holds exactly one operational membership throughout.
      const already = new Set(
        (await tx.vesselGroupMember.findMany({ where: { groupId: input.targetGroupId }, select: { vesselId: true } })).map((m) => m.vesselId),
      );
      const moving = sourceMembers.filter((m) => !already.has(m.vesselId)).map((m) => m.vesselId);
      if (moving.length > 0) {
        await tx.vesselGroupMember.updateMany({
          where: { groupId: input.sourceGroupId, vesselId: { in: moving } },
          data: { groupId: input.targetGroupId },
        });
      }
      // A vessel already in the target keeps that membership; its source row is dropped so the merge
      // does not leave the vessel in two operational groups.
      await tx.vesselGroupMember.deleteMany({ where: { groupId: input.sourceGroupId } });
    }
    if (input.deactivateSource ?? true) {
      await tx.vesselGroup.update({ where: { id: input.sourceGroupId }, data: { isActive: false } });
    }
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselGroup",
      entityId: input.targetGroupId,
      summary: `Merged membership from "${source.name}" into "${target.name}" (${sourceMembers.length} member${sourceMembers.length === 1 ? "" : "s"})`,
    });
  });

  const dto = await getGroup(input.targetGroupId);
  if (!dto) throw new ActionError("Group vanished after merge.");
  return dto;
}

/** One group with members (or null). */
export async function getGroup(groupId: string): Promise<VesselGroupDTO | null> {
  const g = await prisma.vesselGroup.findUnique({
    where: { id: groupId },
    include: { members: { include: { vessel: { select: { id: true, code: true, type: true } } } } },
  });
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    note: g.note,
    isActive: g.isActive,
    members: g.members
      .map((m) => ({ id: m.vessel.id, code: m.vessel.code, type: m.vessel.type, label: label(m.vessel) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  };
}
