import type { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { FUNCTIONAL_ZERO_L } from "@/lib/ledger/vocabulary";

export const LOT_STATUSES = ["ACTIVE", "DEPLETED", "ARCHIVED", "CORRECTED"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export type LotLifecycleActor = { actorUserId: string | null; actorEmail: string };

export type LotLiveHoldings = {
  lotId: string;
  vesselVolumeL: number;
  bottledVolumeL: number;
  bottleCount: number;
  live: boolean;
};

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : typeof d === "number" ? d : Number(d));

export async function loadLotLiveHoldingsTx(
  tx: Prisma.TransactionClient,
  lotIds: string[],
): Promise<Map<string, LotLiveHoldings>> {
  const ids = [...new Set(lotIds)].filter(Boolean);
  const out = new Map<string, LotLiveHoldings>();
  for (const lotId of ids) {
    out.set(lotId, { lotId, vesselVolumeL: 0, bottledVolumeL: 0, bottleCount: 0, live: false });
  }
  if (ids.length === 0) return out;

  const vesselRows = await tx.vesselLot.groupBy({
    by: ["lotId"],
    where: { lotId: { in: ids } },
    _sum: { volumeL: true },
  });
  const bottleRows = await tx.bottledLotState.findMany({
    where: { lotId: { in: ids } },
    select: { lotId: true, volumeL: true, bottleCount: true },
  });

  for (const row of vesselRows) {
    const cur = out.get(row.lotId);
    if (cur) cur.vesselVolumeL = num(row._sum.volumeL);
  }
  for (const row of bottleRows) {
    const cur = out.get(row.lotId);
    if (!cur) continue;
    cur.bottledVolumeL += num(row.volumeL);
    cur.bottleCount += row.bottleCount;
  }
  for (const cur of out.values()) {
    cur.live =
      cur.vesselVolumeL > FUNCTIONAL_ZERO_L ||
      cur.bottledVolumeL > FUNCTIONAL_ZERO_L ||
      cur.bottleCount > 0;
  }
  return out;
}

export async function assertLotsNotArchivedForNormalWriteTx(
  tx: Prisma.TransactionClient,
  input: { lotIds: string[]; allowArchivedWrite?: boolean },
): Promise<void> {
  if (input.allowArchivedWrite) return;
  const ids = [...new Set(input.lotIds)].filter(Boolean);
  if (ids.length === 0) return;

  const archived = await tx.lot.findFirst({
    where: { id: { in: ids }, status: "ARCHIVED" },
    select: { code: true },
  });
  if (archived) {
    throw new ActionError(
      `Lot ${archived.code} is archived. Unarchive it before recording normal cellar work.`,
      "CONFLICT",
    );
  }
}

export async function syncLotLifecycleStatusTx(
  tx: Prisma.TransactionClient,
  input: {
    lotIds: string[];
    actor?: LotLifecycleActor | null;
    allowArchivedReopen?: boolean;
  },
): Promise<void> {
  const ids = [...new Set(input.lotIds)].filter(Boolean);
  if (ids.length === 0) return;

  const lots = await tx.lot.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, status: true } });
  const holdings = await loadLotLiveHoldingsTx(tx, ids);

  for (const lot of lots) {
    const status = lot.status as LotStatus;
    if (status === "CORRECTED") continue;

    const live = holdings.get(lot.id)?.live ?? false;
    let nextStatus: LotStatus | null = null;

    if (status === "ARCHIVED") {
      if (live && input.allowArchivedReopen) nextStatus = "ACTIVE";
    } else if (live && status === "DEPLETED") {
      nextStatus = "ACTIVE";
    } else if (!live && status === "ACTIVE") {
      nextStatus = "DEPLETED";
    }

    if (!nextStatus || nextStatus === status) continue;

    await tx.lot.update({ where: { id: lot.id }, data: { status: nextStatus } });
    if (input.actor) {
      await writeAudit(tx, {
        ...input.actor,
        action: "UPDATE",
        entityType: "Lot",
        entityId: lot.id,
        changes: { status: { from: status, to: nextStatus } },
        summary: `Lifecycle status for Lot "${lot.code}" changed from ${status.toLowerCase()} to ${nextStatus.toLowerCase()}.`,
      });
    }
  }
}

export async function archiveLotTx(
  tx: Prisma.TransactionClient,
  actor: LotLifecycleActor,
  input: { lotId: string; reason?: string | null },
): Promise<{ lotId: string; status: LotStatus }> {
  const lot = await tx.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true, status: true } });
  if (!lot) throw new ActionError("Lot not found.", "CONFLICT");

  const status = lot.status as LotStatus;
  if (status === "ARCHIVED") return { lotId: lot.id, status };
  if (status === "CORRECTED") throw new ActionError("Corrected lots cannot be archived.", "CONFLICT");

  const holdings = await loadLotLiveHoldingsTx(tx, [lot.id]);
  if (holdings.get(lot.id)?.live) {
    throw new ActionError("Archive is only available after all vessel and bottle-storage holdings are zero.", "CONFLICT");
  }

  await tx.lot.update({ where: { id: lot.id }, data: { status: "ARCHIVED" } });
  await writeAudit(tx, {
    ...actor,
    action: "UPDATE",
    entityType: "Lot",
    entityId: lot.id,
    changes: { status: { from: status, to: "ARCHIVED" }, reason: { from: null, to: input.reason?.trim() || null } },
    summary: `Archived Lot "${lot.code}"${input.reason?.trim() ? `: ${input.reason.trim()}` : "."}`,
  });

  return { lotId: lot.id, status: "ARCHIVED" };
}

export async function unarchiveLotTx(
  tx: Prisma.TransactionClient,
  actor: LotLifecycleActor,
  input: { lotId: string },
): Promise<{ lotId: string; status: LotStatus }> {
  const lot = await tx.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true, status: true } });
  if (!lot) throw new ActionError("Lot not found.", "CONFLICT");

  const status = lot.status as LotStatus;
  if (status !== "ARCHIVED") return { lotId: lot.id, status };

  const holdings = await loadLotLiveHoldingsTx(tx, [lot.id]);
  const nextStatus: LotStatus = holdings.get(lot.id)?.live ? "ACTIVE" : "DEPLETED";

  await tx.lot.update({ where: { id: lot.id }, data: { status: nextStatus } });
  await writeAudit(tx, {
    ...actor,
    action: "UPDATE",
    entityType: "Lot",
    entityId: lot.id,
    changes: { status: { from: status, to: nextStatus } },
    summary: `Unarchived Lot "${lot.code}" to ${nextStatus.toLowerCase()}.`,
  });

  return { lotId: lot.id, status: nextStatus };
}
