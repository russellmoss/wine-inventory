import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { round2 } from "@/lib/bottling/draw";
import {
  assertBalanced,
  balanceKey,
  foldLines,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";
import { FUNCTIONAL_ZERO_L, type CaptureMethod, type OperationType } from "@/lib/ledger/vocabulary";

// The single transactional chokepoint for every bulk-wine operation (Phase 1 spine).
// Not a server action (no "server-only") so the Day-Zero migration + verification
// scripts can drive it too. Callers wrap it in runLedgerWrite (SERIALIZABLE + retry)
// and add their own writeAudit. See docs/INVARIANTS.md.

const CAP_EPS = 1e-9;
const num = (d: Prisma.Decimal | number) => (typeof d === "number" ? d : Number(d));

/** Retry a write on Postgres serialization/deadlock aborts (P2034). Mirrors stock/movements. */
export async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
      if (code === "P2034" && i < attempts) continue;
      throw e;
    }
  }
}

/** Run a ledger write at SERIALIZABLE isolation with retry (mirrors bottling/run.ts).
 * A blend touches many rows (N parent lines + child + lineage edges + source-set), so we lift
 * the interactive-transaction timeout above Prisma's 5s default — remote Neon round-trips add
 * up. The ceiling only RAISES the cap; it doesn't slow shorter ops. */
export function runLedgerWrite<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return withWriteRetry(() =>
    prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 20_000,
      maxWait: 10_000,
    }),
  );
}

export type WriteOpInput = {
  type: OperationType;
  lines: LedgerLine[];
  actorUserId: string | null;
  enteredBy: string; // email snapshot (provenance)
  captureMethod?: CaptureMethod;
  note?: string | null;
  observedAt?: Date;
  correctsOperationId?: number | null;
  /** lotId -> human code, for durable line snapshots. */
  lotCodes: Map<string, string>;
  /** vesselId -> human code, for durable line snapshots. */
  vesselCodes: Map<string, string>;
  /** vesselId -> capacityL, for the capacity guard. */
  capacityByVessel: Map<string, number>;
};

/**
 * Within the caller's SERIALIZABLE tx: validate balance, write the immutable operation
 * + its lines, fold them into the VesselLot projection (delete at functional zero), and
 * enforce vessel capacity. The DB CHECK constraints (volumeL>0, deltaL<>0, unique
 * correctsOperationId) are the real guard; these checks fail fast with friendly errors.
 * Returns the new operation id.
 */
export async function writeLotOperation(
  tx: Prisma.TransactionClient,
  input: WriteOpInput,
): Promise<number> {
  assertBalanced(input.lines);

  const vesselIds = [
    ...new Set(input.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string)),
  ];

  // Read full current state for every affected vessel (for fold + capacity), in-tx.
  const current = await tx.vesselLot.findMany({ where: { vesselId: { in: vesselIds } } });
  const currentBalances: VesselLotBalance[] = current.map((r) => ({
    vesselId: r.vesselId,
    lotId: r.lotId,
    volumeL: num(r.volumeL),
  }));

  // Fold validates non-negative + dust-sweeps, yielding the target projection.
  const next = foldLines(currentBalances, input.lines);

  // Capacity guard: a non-negative VesselLot can still overfill a vessel.
  const totalByVessel = new Map<string, number>();
  for (const b of next) totalByVessel.set(b.vesselId, (totalByVessel.get(b.vesselId) ?? 0) + b.volumeL);
  for (const [vid, total] of totalByVessel) {
    const cap = input.capacityByVessel.get(vid);
    if (cap != null && total > cap + CAP_EPS) {
      throw new ActionError(
        `That would exceed ${input.vesselCodes.get(vid) ?? "a vessel"}'s ${cap} L capacity (would hold ${Math.round(total * 100) / 100} L).`,
        "CONFLICT",
      );
    }
  }

  // Create the immutable operation.
  const op = await tx.lotOperation.create({
    data: {
      type: input.type,
      observedAt: input.observedAt ?? undefined,
      actorUserId: input.actorUserId,
      enteredBy: input.enteredBy,
      captureMethod: input.captureMethod ?? "MANUAL",
      note: input.note ?? null,
      correctsOperationId: input.correctsOperationId ?? null,
    },
    select: { id: true },
  });

  // Append the lines (immutable), with durable code snapshots.
  await tx.lotOperationLine.createMany({
    data: input.lines.map((l) => ({
      operationId: op.id,
      lotId: l.lotId,
      vesselId: l.vesselId,
      deltaL: l.deltaL,
      reason: l.reason ?? null,
      lotCode: input.lotCodes.get(l.lotId) ?? l.lotId,
      vesselCode: l.vesselId ? (input.vesselCodes.get(l.vesselId) ?? null) : null,
    })),
  });

  // Apply the projection diff: update/create the survivors, delete those swept to zero.
  const nextByKey = new Map(next.map((b) => [balanceKey(b.vesselId, b.lotId), b]));
  const currentByKey = new Map(current.map((r) => [balanceKey(r.vesselId, r.lotId), r]));
  const affectedKeys = new Set(
    input.lines.filter((l) => l.vesselId).map((l) => balanceKey(l.vesselId as string, l.lotId)),
  );

  for (const key of affectedKeys) {
    const target = nextByKey.get(key);
    const existing = currentByKey.get(key);
    if (!target) {
      if (existing) await tx.vesselLot.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.vesselLot.update({ where: { id: existing.id }, data: { volumeL: target.volumeL } });
    } else {
      await tx.vesselLot.create({
        data: { vesselId: target.vesselId, lotId: target.lotId, volumeL: target.volumeL },
      });
    }
  }

  await syncVesselComponents(tx, input.lines);
  return op.id;
}

/**
 * Keep the legacy `vessel_component` table (variety/vineyard/vintage tuples) in sync as a
 * SECOND derived projection of the ledger, via each lot's origin. This lets the existing
 * read paths behave identically during transition; reads migrate to `vessel_lot` in
 * Phase 2. `vessel_component` is no longer a source of truth. Lots without a full origin
 * tuple (none in Phase 1) are skipped. Folds incrementally so unchanged rows keep their ids.
 */
async function syncVesselComponents(tx: Prisma.TransactionClient, lines: LedgerLine[]): Promise<void> {
  const lotIds = [...new Set(lines.map((l) => l.lotId))];
  const lots = await tx.lot.findMany({
    where: { id: { in: lotIds } },
    select: { id: true, originVarietyId: true, originVineyardId: true, vintageYear: true },
  });
  const originById = new Map(lots.map((l) => [l.id, l]));

  type CompDelta = { vesselId: string; varietyId: string; vineyardId: string; vintage: number; delta: number };
  const deltas = new Map<string, CompDelta>();
  for (const line of lines) {
    if (!line.vesselId) continue;
    const o = originById.get(line.lotId);
    if (!o?.originVarietyId || !o.originVineyardId || o.vintageYear == null) continue; // can't form a tuple
    const key = `${line.vesselId}::${o.originVarietyId}::${o.originVineyardId}::${o.vintageYear}`;
    const cur = deltas.get(key);
    if (cur) cur.delta = round2(cur.delta + line.deltaL);
    else
      deltas.set(key, {
        vesselId: line.vesselId,
        varietyId: o.originVarietyId,
        vineyardId: o.originVineyardId,
        vintage: o.vintageYear,
        delta: line.deltaL,
      });
  }

  for (const c of deltas.values()) {
    if (Math.abs(c.delta) < 1e-9) continue;
    const existing = await tx.vesselComponent.findUnique({
      where: {
        vesselId_varietyId_vineyardId_vintage: {
          vesselId: c.vesselId,
          varietyId: c.varietyId,
          vineyardId: c.vineyardId,
          vintage: c.vintage,
        },
      },
      select: { id: true, volumeL: true },
    });
    const next = round2((existing ? Number(existing.volumeL) : 0) + c.delta);
    if (next <= FUNCTIONAL_ZERO_L) {
      if (existing) await tx.vesselComponent.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.vesselComponent.update({ where: { id: existing.id }, data: { volumeL: next } });
    } else {
      await tx.vesselComponent.create({
        data: { vesselId: c.vesselId, varietyId: c.varietyId, vineyardId: c.vineyardId, vintage: c.vintage, volumeL: next },
      });
    }
  }
}
