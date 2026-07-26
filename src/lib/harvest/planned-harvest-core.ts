// Spray Intelligence S3a — planned harvest date as an AUDITED EVENT STREAM (Unit 10, KD-8 —
// Shape D, the VineyardGeometryVersion closed-interval pattern; council D4). NEW FILE ONLY: S3a
// does not edit src/lib/harvest/actions.ts.
//
// The rules this file owns:
//   - plannedDate crosses EVERY boundary as an ISO YYYY-MM-DD STRING (KD-13 / council C6) —
//     converted only here, at the DB edge, with the canonical UTC helpers. A JS Date would shift
//     a day for a Pacific caller.
//   - one open row per (block, vintage, passLabel) — the partial unique index is the concurrency
//     backstop; ZERO open rows is how "no planned date" is represented (retraction appends no
//     successor, council C3). Split picks coexist under distinct pass labels (council G4).
//   - the stream IS the outbox (council C4): plannedHarvestChangesSince is a WATERMARK read; S7a
//     consumes it with a cursor. There is no in-process listener to lose on a crash.

import "server-only";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { parseISODateUTC, toISODateUTC } from "@/lib/fieldnotes/week";
import {
  advanceCursor,
  deriveChangesSince,
  type PlannedHarvestChange,
  type PlannedHarvestEventRow,
} from "./planned-harvest-events";
import type { SprayActor } from "@/lib/spray/types";

export interface PlannedHarvestKey {
  blockId: string;
  vintageYear: number;
  harvestPassLabel?: string;
}

const passLabelOf = (key: PlannedHarvestKey) => key.harvestPassLabel?.trim() || "main";

/** Set (or move) the planned harvest date: closes the open row and appends the next version, one tx. */
export async function setPlannedHarvestDateCore(
  actor: SprayActor,
  input: PlannedHarvestKey & { plannedDate: string; reason?: string | null },
): Promise<{ version: number; previousDate: string | null }> {
  const date = parseISODateUTC(input.plannedDate);
  if (!date) throw new Error(`plannedDate must be a real ISO YYYY-MM-DD date — got "${input.plannedDate}".`);
  const harvestPassLabel = passLabelOf(input);

  return runInTenantTx(async (tx) => {
    const block = await tx.vineyardBlock.findUnique({ where: { id: input.blockId }, select: { id: true } });
    if (!block) throw new Error(`Block ${input.blockId} not found in this tenant.`);

    const now = new Date();
    const open = await tx.plannedHarvestDateEvent.findFirst({
      where: { blockId: input.blockId, vintageYear: input.vintageYear, harvestPassLabel, effectiveTo: null },
    });
    if (open) {
      await tx.plannedHarvestDateEvent.update({
        where: { id: open.id },
        data: { effectiveTo: now, status: "SUPERSEDED" },
      });
    }
    const agg = await tx.plannedHarvestDateEvent.aggregate({
      where: { blockId: input.blockId, vintageYear: input.vintageYear, harvestPassLabel },
      _max: { version: true },
    });
    const version = (agg._max.version ?? 0) + 1;

    const created = await tx.plannedHarvestDateEvent.create({
      data: {
        blockId: input.blockId,
        vintageYear: input.vintageYear,
        harvestPassLabel,
        plannedDate: date,
        version,
        effectiveFrom: now,
        status: "ACTIVE",
        reason: input.reason ?? null,
        enteredById: actor.userId,
        enteredByEmail: actor.email,
      },
      select: { id: true, version: true },
    });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "CREATE",
      entityType: "planned_harvest_date_event",
      entityId: created.id,
      summary: `Planned harvest for block ${input.blockId} / ${input.vintageYear} / ${harvestPassLabel} set to ${input.plannedDate} (v${version}${open ? `, was ${toISODateUTC(open.plannedDate)}` : ""}).`,
    });

    return { version: created.version, previousDate: open ? toISODateUTC(open.plannedDate) : null };
  });
}

/** Retract: closes the open row and appends NO successor — no open row = no planned date (KD-8). */
export async function retractPlannedHarvestDateCore(
  actor: SprayActor,
  input: PlannedHarvestKey & { reason?: string | null },
): Promise<{ retractedDate: string }> {
  const harvestPassLabel = passLabelOf(input);
  return runInTenantTx(async (tx) => {
    const open = await tx.plannedHarvestDateEvent.findFirst({
      where: { blockId: input.blockId, vintageYear: input.vintageYear, harvestPassLabel, effectiveTo: null },
    });
    if (!open) throw new Error(`No open planned harvest date for block ${input.blockId} / ${input.vintageYear} / ${harvestPassLabel} to retract.`);
    await tx.plannedHarvestDateEvent.update({
      where: { id: open.id },
      data: { effectiveTo: new Date(), status: "RETRACTED" },
    });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "UPDATE",
      entityType: "planned_harvest_date_event",
      entityId: open.id,
      summary: `Retracted planned harvest ${toISODateUTC(open.plannedDate)} for block ${input.blockId} / ${input.vintageYear} / ${harvestPassLabel}${input.reason ? ` (${input.reason})` : ""}.`,
    });
    return { retractedDate: toISODateUTC(open.plannedDate) };
  });
}

export interface CurrentPlannedHarvestDate {
  harvestPassLabel: string;
  plannedDate: string;
  version: number;
}

/**
 * PLURAL by design (council G4): split picks mean a block-vintage can have several open passes.
 * S7a's PHI check must evaluate against the EARLIEST — the early pick is the binding constraint.
 */
export async function currentPlannedHarvestDatesCore(blockId: string, vintageYear: number): Promise<CurrentPlannedHarvestDate[]> {
  const rows = await prisma.plannedHarvestDateEvent.findMany({
    where: { blockId, vintageYear, effectiveTo: null },
    orderBy: { plannedDate: "asc" },
    select: { harvestPassLabel: true, plannedDate: true, version: true },
  });
  return rows.map((r) => ({ harvestPassLabel: r.harvestPassLabel, plannedDate: toISODateUTC(r.plannedDate), version: r.version }));
}

/** Point-in-time: what did we believe this pass's date was at instant `at`? (council D4) */
export async function plannedHarvestDateAsOfCore(
  blockId: string,
  vintageYear: number,
  harvestPassLabel: string,
  at: Date,
): Promise<string | null> {
  const row = await prisma.plannedHarvestDateEvent.findFirst({
    where: {
      blockId,
      vintageYear,
      harvestPassLabel,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { version: "desc" },
    select: { plannedDate: true },
  });
  return row ? toISODateUTC(row.plannedDate) : null;
}

/**
 * The WATERMARK read (KD-8 / council C4): every change strictly after `cursor`, exactly once,
 * with its derived direction. Idempotent from the same cursor. S7a consumes this to run the C8
 * reverse-check (a pulled-forward date re-evaluates the trailing PHI window).
 */
export async function plannedHarvestChangesSinceCore(
  cursor: Date | null,
): Promise<{ changes: PlannedHarvestChange[]; nextCursor: Date | null }> {
  // Step 1: keys touched after the cursor (new versions by enteredAt; retractions by effectiveTo).
  const touched = await prisma.plannedHarvestDateEvent.findMany({
    where: cursor
      ? { OR: [{ enteredAt: { gt: cursor } }, { status: "RETRACTED", effectiveTo: { gt: cursor } }] }
      : {},
    select: { blockId: true, vintageYear: true, harvestPassLabel: true },
    distinct: ["blockId", "vintageYear", "harvestPassLabel"],
  });
  if (!touched.length) return { changes: [], nextCursor: cursor };

  // Step 2: the FULL stream for each touched key (the pure derivation needs predecessors).
  const rows = await prisma.plannedHarvestDateEvent.findMany({
    where: { OR: touched.map((t) => ({ blockId: t.blockId, vintageYear: t.vintageYear, harvestPassLabel: t.harvestPassLabel })) },
    orderBy: [{ blockId: "asc" }, { vintageYear: "asc" }, { harvestPassLabel: "asc" }, { version: "asc" }],
  });
  const eventRows: PlannedHarvestEventRow[] = rows.map((r) => ({
    id: r.id,
    blockId: r.blockId,
    vintageYear: r.vintageYear,
    harvestPassLabel: r.harvestPassLabel,
    plannedDate: toISODateUTC(r.plannedDate),
    version: r.version,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    status: r.status,
    enteredAt: r.enteredAt,
  }));
  const changes = deriveChangesSince(eventRows, cursor);
  return { changes, nextCursor: advanceCursor(changes, cursor) };
}
