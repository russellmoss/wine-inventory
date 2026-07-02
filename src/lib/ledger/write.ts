import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withWriteRetry } from "@/lib/db/write-retry";
import { requireTenantId, runWithTenantContext } from "@/lib/tenant/context";
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
import { foldBottledLot, resolveBucket, assertCountVolumeConsistent } from "@/lib/sparkling/projection";
import { foldBarrelFills, type BarrelAffected } from "@/lib/cost/barrel-fold";
import type { SparklingMethod, BottleStage } from "@prisma/client";

// The single transactional chokepoint for every bulk-wine operation (Phase 1 spine).
// Not a server action (no "server-only") so the Day-Zero migration + verification
// scripts can drive it too. Callers wrap it in runLedgerWrite (SERIALIZABLE + retry)
// and add their own writeAudit. See docs/INVARIANTS.md.

const CAP_EPS = 1e-9;
const num = (d: Prisma.Decimal | number) => (typeof d === "number" ? d : Number(d));

/** Interactive-tx ceilings for the ledger write. Defaults (20s timeout / 10s maxWait) are unchanged
 * for production; both are ENV-OVERRIDABLE so a high-latency link (e.g. verifying from airplane wifi,
 * or a Neon cold-start where round-trips run ~1s each) can lift the ceiling without a code change.
 * The ceiling only RAISES the cap; it never slows a fast op. */
const LEDGER_TX_TIMEOUT_MS = Number(process.env.LEDGER_TX_TIMEOUT_MS) || 20_000;
const LEDGER_TX_MAX_WAIT_MS = Number(process.env.LEDGER_TX_MAX_WAIT_MS) || 10_000;

/** Run a ledger write at SERIALIZABLE isolation with retry (mirrors bottling/run.ts).
 * A blend touches many rows (N parent lines + child + lineage edges + source-set), so we lift
 * the interactive-transaction timeout above Prisma's 5s default — remote Neon round-trips add
 * up. The ceiling only RAISES the cap; it doesn't slow shorter ops. */
export function runLedgerWrite<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // K5: tenant comes from the ALS context (set by action()/adminAction() or a script's runAsTenant).
  // Fail-closed if absent.
  const tenantId = requireTenantId();
  // Use the EXTENDED client under skipWrap: the interactive tx auto-injects tenantId on the cores'
  // originating creates (lot/lineage/vineyard/etc.), while skipWrap stops the per-op extension from
  // nesting a batch tx inside this interactive one (Prisma #23583). tx is exposed as
  // Prisma.TransactionClient so the cores' typings are unchanged.
  return withWriteRetry(() =>
    runWithTenantContext({ tenantId, skipWrap: true }, () =>
      prisma.$transaction(
        async (tx) => {
          // Set the tenant as the FIRST statement of the interactive tx — BEFORE fn(tx)'s
          // vessel_lot fold reads (which under RLS would otherwise see 0 rows). Living here means
          // it is re-applied on every P2034 retry (withWriteRetry re-enters $transaction).
          // is_local=true is transaction-scoped (pooling-safe); bound param, never interpolated.
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          return fn(tx as unknown as Prisma.TransactionClient);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: LEDGER_TX_TIMEOUT_MS,
          maxWait: LEDGER_TX_MAX_WAIT_MS,
        },
      ),
    ),
    5,
    "ledger",
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
  /** Phase 6: client idempotency key (crush/press/saignée). UNIQUE — a duplicate submit
   * aborts with P2002, which the caller treats as success (council S4). */
  commandId?: string | null;
  /** lotId -> human code, for durable line snapshots. */
  lotCodes: Map<string, string>;
  /** vesselId -> human code, for durable line snapshots. */
  vesselCodes: Map<string, string>;
  /** vesselId -> capacityL, for the capacity guard. */
  capacityByVessel: Map<string, number>;
  /** Phase 7 (K2): descriptive attributes for a BottledLotState row the chokepoint FIRST-CREATES
   * from a BOTTLE_STORAGE line (i.e. tirage). volumeL + bottleCount are FOLDED from the lines,
   * never passed here. Required when a BOTTLE_STORAGE line creates a lot's state for the first
   * time; ignored on updates. */
  bottleState?: {
    nominalFillMl: number;
    method: SparklingMethod;
    tirageAt: Date;
    locationId?: string | null;
    stage?: BottleStage; // defaults EN_TIRAGE (tirage is the only op that first-creates)
  };
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
  const tenantId = requireTenantId();

  const vesselIds = [
    ...new Set(input.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string)),
  ];
  const lotIds = [...new Set(input.lines.map((l) => l.lotId))];

  // Cross-tenant / visibility guard (council DQ8, K11): every referenced lot + vessel MUST be
  // visible AND belong to this tenant. Under RLS a foreign/spoofed row is invisible, so a count
  // shortfall means someone referenced another winery's (or a non-existent) id — FAIL loudly
  // rather than silently fold on 0 rows. (Composite FKs also block the write at the DB; this is the
  // app-layer belt so we never mis-compute.)
  const [visibleLots, visibleVessels] = await Promise.all([
    tx.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, tenantId: true } }),
    vesselIds.length
      ? tx.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, tenantId: true } })
      : Promise.resolve([] as { id: string; tenantId: string }[]),
  ]);
  if (visibleLots.length !== lotIds.length) {
    throw new ActionError("One or more lots aren't accessible in this winery.", "CONFLICT");
  }
  if (visibleVessels.length !== vesselIds.length) {
    throw new ActionError("One or more vessels aren't accessible in this winery.", "CONFLICT");
  }
  if (visibleLots.some((l) => l.tenantId !== tenantId) || visibleVessels.some((v) => v.tenantId !== tenantId)) {
    throw new ActionError("Cross-winery operation blocked.", "CONFLICT");
  }

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
      tenantId,
      type: input.type,
      observedAt: input.observedAt ?? undefined,
      actorUserId: input.actorUserId,
      enteredBy: input.enteredBy,
      captureMethod: input.captureMethod ?? "MANUAL",
      note: input.note ?? null,
      correctsOperationId: input.correctsOperationId ?? null,
      commandId: input.commandId ?? null,
    },
    select: { id: true },
  });

  // Append the lines (immutable), with durable code snapshots + the Phase 7 bucket discriminator.
  // A BOTTLE_STORAGE leg carries bottleDelta; every other leg leaves it null (the DB CHECK
  // enforces the iff, so a malformed BOTTLE_STORAGE line with no bottleDelta is rejected there).
  await tx.lotOperationLine.createMany({
    data: input.lines.map((l) => {
      const bucket = resolveBucket(l);
      return {
        tenantId,
        operationId: op.id,
        lotId: l.lotId,
        vesselId: l.vesselId,
        deltaL: l.deltaL,
        reason: l.reason ?? null,
        bucket,
        bottleDelta: bucket === "BOTTLE_STORAGE" ? (l.bottleDelta ?? null) : null,
        lotCode: input.lotCodes.get(l.lotId) ?? l.lotId,
        vesselCode: l.vesselId ? (input.vesselCodes.get(l.vesselId) ?? null) : null,
      };
    }),
  });

  // Apply the projection diff: update/create the survivors, delete those swept to zero.
  const nextByKey = new Map(next.map((b) => [balanceKey(b.vesselId, b.lotId), b]));
  const currentByKey = new Map(current.map((r) => [balanceKey(r.vesselId, r.lotId), r]));
  const affectedKeys = new Set(
    input.lines.filter((l) => l.vesselId).map((l) => balanceKey(l.vesselId as string, l.lotId)),
  );

  const barrelAffected: BarrelAffected[] = [];
  for (const key of affectedKeys) {
    const target = nextByKey.get(key);
    const existing = currentByKey.get(key);
    if (!target) {
      if (existing) await tx.vesselLot.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.vesselLot.update({ where: { id: existing.id }, data: { volumeL: target.volumeL } });
    } else {
      await tx.vesselLot.create({
        data: { tenantId, vesselId: target.vesselId, lotId: target.lotId, volumeL: target.volumeL },
      });
    }
    // Phase 8b (Unit 8): capture the before/after for the barrel-fill fold below (vessel-bearing keys).
    if (target || existing) {
      barrelAffected.push({
        vesselId: (target?.vesselId ?? existing?.vesselId) as string,
        lotId: (target?.lotId ?? existing?.lotId) as string,
        beforeL: existing ? num(existing.volumeL) : 0,
        afterL: target ? target.volumeL : 0,
      });
    }
  }

  // Phase 8b (Unit 8, D7): the barrel-fill fold — the cost domain's fourth deterministic projection at
  // the chokepoint. NO-OP unless an affected vessel is a barrel with a BarrelAsset. Opens a fill when
  // wine enters an empty barrel; closes it + materializes an immutable BARREL CostLine when wine leaves.
  await foldBarrelFills(tx, {
    affected: barrelAffected,
    opId: op.id,
    observedAt: input.observedAt ?? new Date(),
  });

  // Phase 7 (K2): fold the BottledLotState projection from the BOTTLE_STORAGE legs — the SECOND
  // deterministic projection, materialized inside the same chokepoint (D2/D14). Additive: it runs
  // only when a BOTTLE_STORAGE leg is present and touches nothing the vessel fold saw. Plain in-tx
  // read (same as the vessel_lot read above) — SERIALIZABLE + withWriteRetry is the concurrency
  // guard, NO bespoke row lock (matches the house pattern).
  const bottleLotIds = [
    ...new Set(input.lines.filter((l) => resolveBucket(l) === "BOTTLE_STORAGE").map((l) => l.lotId)),
  ];
  if (bottleLotIds.length > 0) {
    const currentStates = await tx.bottledLotState.findMany({ where: { lotId: { in: bottleLotIds } } });
    const stateByLot = new Map(currentStates.map((s) => [s.lotId, s]));
    for (const lotId of bottleLotIds) {
      const existing = stateByLot.get(lotId);
      const currentProj = existing ? { lotId, bottleCount: existing.bottleCount, volumeL: num(existing.volumeL) } : null;
      const next = foldBottledLot(currentProj, input.lines, lotId);

      if (!next) {
        if (existing) await tx.bottledLotState.delete({ where: { lotId } });
        continue;
      }

      if (existing) {
        assertCountVolumeConsistent(next, existing.nominalFillMl);
        await tx.bottledLotState.update({
          where: { lotId },
          data: { bottleCount: next.bottleCount, volumeL: next.volumeL },
        });
      } else {
        // First create — only a BOTTLE_STORAGE line that ORIGINATES the bottle lot (tirage) gets
        // here, and it MUST bring the descriptive attributes (method/nominalFill/tirageAt).
        if (!input.bottleState) {
          throw new ActionError("A bottling operation must supply bottleState to create the bottled-lot projection.");
        }
        assertCountVolumeConsistent(next, input.bottleState.nominalFillMl);
        await tx.bottledLotState.create({
          data: {
            tenantId,
            lotId,
            bottleCount: next.bottleCount,
            volumeL: next.volumeL,
            nominalFillMl: input.bottleState.nominalFillMl,
            method: input.bottleState.method,
            stage: input.bottleState.stage ?? "EN_TIRAGE",
            tirageAt: input.bottleState.tirageAt,
            locationId: input.bottleState.locationId ?? null,
          },
        });
      }
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
  const tenantId = requireTenantId();
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
    const existing = await tx.vesselComponent.findFirst({
      where: {
        vesselId: c.vesselId,
        varietyId: c.varietyId,
        vineyardId: c.vineyardId,
        vintage: c.vintage,
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
        data: { tenantId, vesselId: c.vesselId, varietyId: c.varietyId, vineyardId: c.vineyardId, vintage: c.vintage, volumeL: next },
      });
    }
  }
}
