"use server";

import { revalidatePath } from "next/cache";
import { requireTenantId } from "@/lib/tenant/context";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx, runInTenantRawTx } from "@/lib/tenant/tx";
import { action, getActionUser, ActionError } from "@/lib/actions";
import { canManagerAccessVineyard } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { parseISODateUTC } from "@/lib/fieldnotes/week";
import { toKg, type Unit } from "@/lib/harvest/units";
import {
  groupYieldsByVintage,
  type HarvestRecordDTO,
  type BlockMeta,
  type VintageGroup,
} from "@/lib/harvest/aggregate";
import { deriveBrixAtPick, groupSeriesByBlock } from "@/lib/harvest/dashboard";

const PATH = "/vineyards/harvest";

const BRIX_MIN = 0;
const BRIX_MAX = 35; // sane ripening ceiling; DB CHECK backstops at 40

export type BrixLogDTO = {
  id: string;
  blockId: string;
  brixValue: number;
  recordedAt: string;
  createdByEmail: string;
  note: string | null;
};

export type PickDTO = {
  id: string;
  pickDate: string;
  weightKg: number;
  brixAtPick: number | null;
  createdByEmail: string;
};
export type HarvestBlockDTO = {
  blockId: string;
  vintageYear: number;
  yieldEstimateKg: number | null;
  picks: PickDTO[];
};

// ── Admin dashboard (in-season: Brix curve + estimate + picks per block) ──
export type DashboardBlockDTO = {
  blockId: string;
  label: string;
  varietyName: string | null;
  varietyId: string | null;
  varietyColor: string | null;
  latestBrix: { brixValue: number; recordedAt: string } | null;
  yieldEstimateKg: number | null;
  picks: PickDTO[]; // picks[].brixAtPick is resolved (explicit or nearest reading)
  series: { recordedAt: string; brixValue: number }[]; // this season, oldest-first
};
export type VineyardHarvestDashboard = {
  vintageYear: number;
  blocks: DashboardBlockDTO[];
  groups: VintageGroup[]; // historic yields-by-vintage (secondary section)
};

function assertUnit(raw: unknown): Unit {
  if (raw === "metric" || raw === "imperial") return raw;
  throw new ActionError("Unit must be metric or imperial.");
}

/** Resolve a block's vineyard and enforce manager scope; returns the vineyardId. */
async function requireBlockAccess(blockId: string): Promise<string> {
  const user = await getActionUser();
  const block = await prisma.vineyardBlock.findUnique({
    where: { id: blockId },
    select: { vineyardId: true },
  });
  if (!block) throw new ActionError("Block not found.");
  if (!canManagerAccessVineyard(user, block.vineyardId)) {
    throw new ActionError("You can only work with your assigned vineyard.", "FORBIDDEN");
  }
  return block.vineyardId;
}

/** Log a single Brix reading for a block. */
export const logBrix = action(
  async ({ actor }, blockId: string, brixValue: number, recordedAt?: string): Promise<void> => {
    const vineyardId = await requireBlockAccess(blockId);
    if (typeof brixValue !== "number" || !Number.isFinite(brixValue)) {
      throw new ActionError("Enter a Brix value.");
    }
    if (brixValue < BRIX_MIN || brixValue > BRIX_MAX) {
      throw new ActionError(`Brix must be between ${BRIX_MIN} and ${BRIX_MAX} °Bx.`);
    }
    const when = recordedAt ? parseISODateUTC(recordedAt) ?? new Date() : new Date();
    await runInTenantTx(async (tx) => {
      const row = await tx.brixLog.create({
        data: {
          blockId,
          vineyardId,
          brixValue: new Prisma.Decimal(brixValue),
          recordedAt: when,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        ...actor,
        action: "BRIX_LOGGED",
        entityType: "BrixLog",
        entityId: row.id,
        summary: `Logged ${brixValue} °Bx`,
      });
    });
    revalidatePath(PATH);
  },
);

/** Delete a single Brix reading (correcting a mistaken entry). Scoped + audited. */
export const deleteBrixLog = action(
  async ({ user, actor }, brixLogId: string): Promise<void> => {
    const row = await prisma.brixLog.findUnique({
      where: { id: brixLogId },
      select: { id: true, vineyardId: true, brixValue: true, recordedAt: true },
    });
    if (!row) throw new ActionError("That Brix reading was not found.");
    if (!canManagerAccessVineyard(user, row.vineyardId)) {
      throw new ActionError("You can only work with your assigned vineyard.", "FORBIDDEN");
    }
    await runInTenantTx(async (tx) => {
      await tx.brixLog.delete({ where: { id: brixLogId } });
      await writeAudit(tx, {
        ...actor,
        action: "DELETE",
        entityType: "BrixLog",
        entityId: brixLogId,
        summary: `Deleted ${row.brixValue.toNumber()} °Bx reading`,
      });
    });
    revalidatePath(PATH);
  },
);

/** Record/update the pre-harvest yield estimate for a block+vintage (only the estimate). */
export const recordYieldEstimate = action(
  async (
    { actor },
    blockId: string,
    estimate: number,
    unit: string,
    vintageYear: number,
  ): Promise<void> => {
    const vineyardId = await requireBlockAccess(blockId);
    const kg = toKg(estimate, assertUnit(unit));
    if (kg == null) throw new ActionError("Enter a valid (non-negative) estimate.");
    if (!Number.isInteger(vintageYear)) throw new ActionError("Pick a vintage year.");
    const estimateKg = new Prisma.Decimal(kg);
    await runInTenantTx(async (tx) => {
      const record = await tx.harvestRecord.upsert({
        where: { tenantId_blockId_vintageYear: { tenantId: requireTenantId(), blockId, vintageYear } },
        update: { yieldEstimateKg: estimateKg, updatedByEmail: actor.actorEmail },
        create: {
          blockId,
          vineyardId,
          vintageYear,
          yieldEstimateKg: estimateKg,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        ...actor,
        action: "HARVEST_ESTIMATED",
        entityType: "HarvestRecord",
        entityId: record.id,
        summary: `Estimated ${vintageYear} yield for a block`,
      });
    });
    revalidatePath(PATH);
  },
);

/** Add a pick pass to a block+vintage. Multiple passes accumulate; total is derived. */
export const addHarvestPick = action(
  async (
    { actor },
    blockId: string,
    weight: number,
    unit: string,
    pickDate: string,
    vintageYear?: number,
    brixAtPick?: number | null,
  ): Promise<void> => {
    const vineyardId = await requireBlockAccess(blockId);
    const kg = toKg(weight, assertUnit(unit));
    if (kg == null || kg <= 0) throw new ActionError("Enter a pick weight greater than zero.");
    const date = parseISODateUTC(pickDate);
    if (!date) throw new ActionError("Enter a valid pick date.");
    const vintage = vintageYear ?? date.getUTCFullYear();
    let brix: Prisma.Decimal | null = null;
    if (brixAtPick != null) {
      if (!Number.isFinite(brixAtPick) || brixAtPick < BRIX_MIN || brixAtPick > BRIX_MAX) {
        throw new ActionError(`Brix must be between ${BRIX_MIN} and ${BRIX_MAX} °Bx.`);
      }
      brix = new Prisma.Decimal(brixAtPick);
    }
    await runInTenantTx(async (tx) => {
      const record = await tx.harvestRecord.upsert({
        where: { tenantId_blockId_vintageYear: { tenantId: requireTenantId(), blockId, vintageYear: vintage } },
        update: { updatedByEmail: actor.actorEmail },
        create: {
          blockId,
          vineyardId,
          vintageYear: vintage,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
        select: { id: true },
      });
      const pick = await tx.harvestPick.create({
        data: {
          harvestRecordId: record.id,
          pickDate: date,
          weightKg: new Prisma.Decimal(kg),
          brixAtPick: brix,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        ...actor,
        action: "HARVEST_PICK_RECORDED",
        entityType: "HarvestPick",
        entityId: pick.id,
        summary: `Recorded a ${vintage} harvest pick`,
      });
    });
    revalidatePath(PATH);
  },
);

/** Delete a mis-entered pick (scope-checked through its record's vineyard). */
export const deleteHarvestPick = action(async ({ actor }, pickId: string): Promise<void> => {
  const pick = await prisma.harvestPick.findUnique({
    where: { id: pickId },
    select: { id: true, harvestRecord: { select: { vineyardId: true } } },
  });
  if (!pick) throw new ActionError("Pick not found.");
  const user = await getActionUser();
  if (!canManagerAccessVineyard(user, pick.harvestRecord.vineyardId)) {
    throw new ActionError("You can only work with your assigned vineyard.", "FORBIDDEN");
  }
  await runInTenantTx(async (tx) => {
    await tx.harvestPick.delete({ where: { id: pickId } });
    await writeAudit(tx, {
      ...actor,
      action: "HARVEST_PICK_RECORDED",
      entityType: "HarvestPick",
      entityId: pickId,
      summary: `Deleted a harvest pick`,
    });
  });
  revalidatePath(PATH);
});

// ───────────────────────── Reads (Decimal -> number at the edge) ─────────────────────────

/** Full Brix history for a block, newest first. */
export async function getBlockBrixHistory(blockId: string): Promise<BrixLogDTO[]> {
  await requireBlockAccess(blockId);
  const rows = await prisma.brixLog.findMany({
    where: { blockId },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    select: { id: true, blockId: true, brixValue: true, recordedAt: true, createdByEmail: true, note: true },
  });
  return rows.map((r) => ({
    id: r.id,
    blockId: r.blockId,
    brixValue: r.brixValue.toNumber(),
    recordedAt: r.recordedAt.toISOString(),
    createdByEmail: r.createdByEmail,
    note: r.note,
  }));
}

/** Latest Brix reading per block for a vineyard — ONE query (council S2, no N+1). */
export async function getLatestBrixByBlock(
  vineyardId: string,
): Promise<Record<string, { brixValue: number; recordedAt: string }>> {
  await requireVineyardScope(vineyardId);
  // Raw read: the tenant extension does not intercept $queryRaw, so run it inside runInTenantRawTx
  // (sets app.tenant_id for RLS) with an explicit tenantId predicate as a backstop. See plan 029.
  const rows = await runInTenantRawTx((tx, tenantId) =>
    tx.$queryRaw<Array<{ blockId: string; brixValue: unknown; recordedAt: Date }>>`
      SELECT DISTINCT ON ("blockId") "blockId", "brixValue", "recordedAt"
      FROM "brix_log"
      WHERE "vineyardId" = ${vineyardId}
        AND "tenantId" = ${tenantId}
      ORDER BY "blockId", "recordedAt" DESC, "id" DESC
    `,
  );
  const out: Record<string, { brixValue: number; recordedAt: string }> = {};
  for (const r of rows) {
    out[r.blockId] = {
      brixValue: Number(r.brixValue),
      recordedAt: new Date(r.recordedAt).toISOString(),
    };
  }
  return out;
}

/** All harvest records + picks + block metadata for a vineyard, plus the grouped view. */
export async function getVineyardHarvest(
  vineyardId: string,
): Promise<{ records: HarvestBlockDTO[]; groups: VintageGroup[] }> {
  await requireVineyardScope(vineyardId);
  const [records, blocks] = await Promise.all([
    prisma.harvestRecord.findMany({
      where: { vineyardId },
      select: {
        blockId: true,
        vintageYear: true,
        yieldEstimateKg: true,
        picks: {
          orderBy: { pickDate: "asc" },
          select: { id: true, pickDate: true, weightKg: true, brixAtPick: true, createdByEmail: true },
        },
      },
    }),
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      select: { id: true, blockLabel: true, variety: { select: { name: true } } },
    }),
  ]);

  const dtos: HarvestBlockDTO[] = records.map((r) => ({
    blockId: r.blockId,
    vintageYear: r.vintageYear,
    yieldEstimateKg: r.yieldEstimateKg ? r.yieldEstimateKg.toNumber() : null,
    picks: r.picks.map((p) => ({
      id: p.id,
      pickDate: p.pickDate.toISOString().slice(0, 10),
      weightKg: p.weightKg.toNumber(),
      brixAtPick: p.brixAtPick != null ? p.brixAtPick.toNumber() : null,
      createdByEmail: p.createdByEmail,
    })),
  }));

  const meta: BlockMeta[] = blocks.map((b) => ({
    id: b.id,
    label: b.blockLabel ?? b.id,
    varietyName: b.variety?.name ?? null,
  }));

  const recordsForAgg: HarvestRecordDTO[] = dtos.map((d) => ({
    blockId: d.blockId,
    vintageYear: d.vintageYear,
    yieldEstimateKg: d.yieldEstimateKg,
    picks: d.picks.map((p) => ({ weightKg: p.weightKg, pickDate: p.pickDate })),
  }));

  return { records: dtos, groups: groupYieldsByVintage(recordsForAgg, meta) };
}

/**
 * Everything the admin harvest dashboard renders for one vineyard: per-block Brix
 * series for the current season, current Brix, yield estimate, and picks (each with
 * its resolved Brix-at-pick), plus the historic yields-by-vintage groups. One scope
 * check, three queries.
 */
export async function getVineyardHarvestDashboard(
  vineyardId: string,
): Promise<VineyardHarvestDashboard> {
  await requireVineyardScope(vineyardId);
  const vintageYear = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(vintageYear, 0, 1));
  const yearEnd = new Date(Date.UTC(vintageYear + 1, 0, 1));

  const [blocks, allRecords, brixRows] = await Promise.all([
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, blockLabel: true, variety: { select: { id: true, name: true, color: true } } },
    }),
    prisma.harvestRecord.findMany({
      where: { vineyardId },
      select: {
        blockId: true,
        vintageYear: true,
        yieldEstimateKg: true,
        picks: {
          orderBy: { pickDate: "asc" },
          select: { id: true, pickDate: true, weightKg: true, brixAtPick: true, createdByEmail: true },
        },
      },
    }),
    prisma.brixLog.findMany({
      where: { vineyardId, recordedAt: { gte: yearStart, lt: yearEnd } },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      select: { blockId: true, brixValue: true, recordedAt: true },
    }),
  ]);

  // Brix series per block (this season, oldest-first).
  const seriesByBlock = groupSeriesByBlock(
    brixRows.map((r) => ({
      blockId: r.blockId,
      brixValue: r.brixValue.toNumber(),
      recordedAt: r.recordedAt.toISOString(),
    })),
  );

  // Current-season records keyed by block.
  const recordByBlock = new Map<string, (typeof allRecords)[number]>();
  for (const r of allRecords) {
    if (r.vintageYear === vintageYear) recordByBlock.set(r.blockId, r);
  }

  const dashboardBlocks: DashboardBlockDTO[] = blocks.map((b) => {
    const series = seriesByBlock[b.id] ?? [];
    const latestBrix = series.length ? series[series.length - 1] : null;
    const rec = recordByBlock.get(b.id);
    const picks: PickDTO[] = (rec?.picks ?? []).map((p) => {
      const pickDate = p.pickDate.toISOString().slice(0, 10);
      const explicit = p.brixAtPick != null ? p.brixAtPick.toNumber() : null;
      return {
        id: p.id,
        pickDate,
        weightKg: p.weightKg.toNumber(),
        brixAtPick: deriveBrixAtPick({ pickDate, brixAtPick: explicit }, series),
        createdByEmail: p.createdByEmail,
      };
    });
    return {
      blockId: b.id,
      label: b.blockLabel ?? b.id,
      varietyName: b.variety?.name ?? null,
      varietyId: b.variety?.id ?? null,
      varietyColor: b.variety?.color ?? null,
      latestBrix,
      yieldEstimateKg: rec?.yieldEstimateKg ? rec.yieldEstimateKg.toNumber() : null,
      picks,
      series,
    };
  });

  // Historic groups (all vintages) for the secondary "Past vintages" section.
  const meta: BlockMeta[] = blocks.map((b) => ({
    id: b.id,
    label: b.blockLabel ?? b.id,
    varietyName: b.variety?.name ?? null,
  }));
  const recordsForAgg: HarvestRecordDTO[] = allRecords.map((r) => ({
    blockId: r.blockId,
    vintageYear: r.vintageYear,
    yieldEstimateKg: r.yieldEstimateKg ? r.yieldEstimateKg.toNumber() : null,
    picks: r.picks.map((p) => ({ weightKg: p.weightKg.toNumber(), pickDate: p.pickDate.toISOString().slice(0, 10) })),
  }));

  return { vintageYear, blocks: dashboardBlocks, groups: groupYieldsByVintage(recordsForAgg, meta) };
}

/** Scope guard for vineyard-level reads. */
async function requireVineyardScope(vineyardId: string) {
  const user = await getActionUser();
  if (!canManagerAccessVineyard(user, vineyardId)) {
    throw new ActionError("You can only work with your assigned vineyard.", "FORBIDDEN");
  }
}
