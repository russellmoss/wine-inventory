import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import {
  assertBalanced,
  balanceKey,
  foldLines,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";
import { type CaptureMethod, type OperationType } from "@/lib/ledger/vocabulary";

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

/** Run a ledger write at SERIALIZABLE isolation with retry (mirrors bottling/run.ts). */
export function runLedgerWrite<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return withWriteRetry(() =>
    prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
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

  return op.id;
}
