import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withWriteRetry } from "@/lib/db/write-retry";
import { requireTenantId, runWithTenantContext } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { round2 } from "@/lib/bottling/draw";
import {
  assertBalanced,
  assertNoWorsenedCoResidence,
  balanceKey,
  foldLines,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";
import { FUNCTIONAL_ZERO_L, type CaptureMethod, type OperationType } from "@/lib/ledger/vocabulary";
import { foldBottledLot, resolveBucket, assertCountVolumeConsistent } from "@/lib/sparkling/projection";
import { foldBarrelFills, type BarrelAffected } from "@/lib/cost/barrel-fold";
import { cascadeAmendmentsForWrite } from "@/lib/compliance/amend";
import { assertLotsNotArchivedForNormalWriteTx, syncLotLifecycleStatusTx } from "@/lib/lot/lifecycle";
import { composeLeaves, type LineageEdge } from "@/lib/lot/lineage";
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
  /** Phase 3 migration: groups opening-balance seed ops for one import batch. */
  batchId?: string | null;
  /** Structured provenance/idempotency metadata persisted with the immutable op. */
  metadata?: Prisma.InputJsonValue | null;
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

  const allowArchivedWrite = input.correctsOperationId != null || input.type === "CORRECTION";
  await assertLotsNotArchivedForNormalWriteTx(tx, { lotIds, allowArchivedWrite });

  // Phase 2 (TAXPAID-1 / CO-1): the tax-paid boundary is one-way. reversibilityOf(false) closes only
  // the timeline Undo; this chokepoint guard is the invariant's teeth — it stops in-bond volume from
  // sneaking back for a tax-paid-removed lot behind the reverser. Two vectors are blocked (the ONLY
  // sanctioned re-admission is a refund-flagged RETURN_TO_BOND, which is excluded here):
  //   (a) a CORRECTION whose target is a REMOVE_TAXPAID op (a direct compensating re-admission);
  //   (b) a manual ADJUST that adds in-bond volume to a lot that carries tax-paid-removed volume.
  // Normal in-bond adds of OTHER wine (RACK/TOPPING/BLEND/transfer) are not caught — they don't
  // restore the removed tax-paid volume.
  if (input.type !== "RETURN_TO_BOND") {
    if (input.correctsOperationId != null) {
      const corrected = await tx.lotOperation.findUnique({ where: { id: input.correctsOperationId }, select: { type: true } });
      if (corrected?.type === "REMOVE_TAXPAID") {
        throw new ActionError(
          "Tax-paid removals are final for TTB. To bring wine back into bond, record a Return-to-Bond (refund) instead.",
          "CONFLICT",
        );
      }
    }
    if (input.type === "ADJUST") {
      const addedInBondLots = [...new Set(input.lines.filter((l) => l.vesselId && l.deltaL > 0).map((l) => l.lotId))];
      if (addedInBondLots.length > 0) {
        const taxpaid = await tx.lotOperationLine.findFirst({
          where: { lotId: { in: addedInBondLots }, operation: { type: "REMOVE_TAXPAID" } },
          select: { lotId: true },
        });
        if (taxpaid) {
          throw new ActionError(
            "That lot has wine removed tax-paid, which is final for TTB. Record a Return-to-Bond (refund) to bring wine back into bond.",
            "CONFLICT",
          );
        }
      }
    }
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
      batchId: input.batchId ?? null,
      metadata: input.metadata ?? undefined,
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
        // Phase 2 (BOND-1): line-level bond affiliation, stamped verbatim by the bond-moving cores.
        sourceBondId: l.sourceBondId ?? null,
        destBondId: l.destBondId ?? null,
      };
    }),
  });

  // LEDGER-12: a vessel holds one cohesive liquid. Enforced on the POST-FOLD balances, so an
  // operation that drains one lot while filling another in the SAME op stays legal. Monotone by
  // design — see assertNoWorsenedCoResidence.
  assertNoWorsenedCoResidence(
    current.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: num(r.volumeL) })),
    next,
  );

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

  await syncVesselComponents(tx, input.lines, input.type);

  // Phase 2 (AMEND-1): the compliance domain's fold at the chokepoint. If this op lands at/inside an
  // already-FILED 5120.17 period, mark the affected (formType, bond) chains NEEDS_AMENDMENT in the SAME
  // tx (broadened trigger, eng A1 — covers correction/transfer/return/removal/adjust uniformly). Cheap
  // no-op for a current-period op (one findFirst returns nothing). 5120.17-only; excise is untouched.
  await cascadeAmendmentsForWrite(tx, { lines: input.lines, observedAt: input.observedAt ?? new Date() });

  await syncLotLifecycleStatusTx(tx, {
    lotIds,
    actor: { actorUserId: input.actorUserId, actorEmail: input.enteredBy },
    allowArchivedReopen: allowArchivedWrite,
  });

  return op.id;
}

/**
 * Keep `vessel_component` (variety/vineyard/vintage tuples) in sync as a SECOND derived
 * projection of the ledger. This is the "what's actually in this tank" breakdown the vessel
 * screens read — Vintrace's composition model, folded from the same lines as the occupancy.
 * Folds incrementally so unchanged rows keep their ids.
 *
 * A lot with a full origin tuple contributes it directly. A BLEND lot has NO origin by
 * construction (blend-core: "origin* stay NULL — a multi-source blend has no single origin"),
 * so it is attributed to its ANCESTOR LEAVES via composeLeaves, weighted by lineage fractions:
 *
 *     24-BL-A  (blend, no origin)          →  0.7 × 24-PN-1  (Pinot / Rilla / 2024)
 *       ├─ 0.7 24-PN-1                        0.3 × 24-CS-1  (Cabernet / Oak Ridge / 2024)
 *       └─ 0.3 24-CS-1
 *
 * Without that walk the whole delta is silently dropped and the tank's breakdown decays every
 * time blended wine moves — which is exactly the case that became the norm once every combine
 * defaults to absorbing into the resident lot (plan 088, Unit 5).
 *
 * A leaf that still has no origin tuple (a legacy/unknown-provenance lot) contributes nothing;
 * that share is genuinely unattributable, and the lot's `provenanceComplete: false` is what
 * tells the UI to say so rather than imply the breakdown is whole.
 */
/**
 * Load every lineage edge reachable UPWARD from `rootIds`, breadth-first with a depth bound.
 * composeLeaves is cycle-guarded, but the read itself needs a ceiling so a deep solera can't
 * turn one write into an unbounded walk. Depth 8 matches lineage.ts's DEFAULT_MAX_DEPTH.
 */
async function loadAncestryEdges(tx: Prisma.TransactionClient, rootIds: string[]): Promise<LineageEdge[]> {
  const edges: LineageEdge[] = [];
  const seen = new Set<string>(rootIds);
  let frontier = rootIds;
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const rows = await tx.lotLineage.findMany({
      where: { childLotId: { in: frontier } },
      select: { parentLotId: true, childLotId: true, fraction: true, kind: true },
    });
    if (rows.length === 0) break;
    const next: string[] = [];
    for (const r of rows) {
      edges.push({
        parentLotId: r.parentLotId,
        childLotId: r.childLotId,
        fraction: r.fraction == null ? null : num(r.fraction),
        kind: r.kind,
      });
      if (!seen.has(r.parentLotId)) {
        seen.add(r.parentLotId);
        next.push(r.parentLotId);
      }
    }
    frontier = next;
  }
  return edges;
}

async function syncVesselComponents(tx: Prisma.TransactionClient, lines: LedgerLine[], opType: OperationType): Promise<void> {
  const tenantId = requireTenantId();
  const lotIds = [...new Set(lines.map((l) => l.lotId))];
  const lots = await tx.lot.findMany({
    where: { id: { in: lotIds } },
    select: { id: true, originVarietyId: true, originVineyardId: true, vintageYear: true },
  });
  const originById = new Map(lots.map((l) => [l.id, l]));

  type Origin = { originVarietyId: string | null; originVineyardId: string | null; vintageYear: number | null };
  const hasTuple = (o: Origin | undefined): o is Origin & { originVarietyId: string; originVineyardId: string; vintageYear: number } =>
    !!o?.originVarietyId && !!o.originVineyardId && o.vintageYear != null;

  // EVERY lot on these lines resolves through its lineage, not just the origin-less ones.
  //
  // Unit 5 only walked lots with no origin tuple, which fixed blend children but left the mirror
  // case wrong: a lot that HAS an origin and then ABSORBS another lot. `hasTuple` short-circuited,
  // so the absorbed wine was credited to the resident's own variety and the tank reported 100% of
  // it — 625 L of Cabernet showing as Syrah. composeLeaves handles both shapes with one rule: a
  // lot with no parents is its own single leaf (so a plain single-origin lot is unchanged), and a
  // lot with parents is attributed to its ancestors with the uncovered remainder falling back to
  // itself — which is precisely the resident's own share (plan 088, Unit 12b).
  const needLineage = [...new Set(lines.filter((l) => l.vesselId).map((l) => l.lotId))];
  const leafShares = new Map<string, { lotId: string; weight: number }[]>();
  // Direction-aware attribution: what ARRIVED (identity-changing ops) or what is GOING BACK
  // (corrections). Falls through to the lot’s own makeup when neither applies.
  const directionalShares = new Map<string, { sign: 1 | -1; leaves: { lotId: string; weight: number }[] }>();
  if (needLineage.length > 0) {
    const edges = await loadAncestryEdges(tx, needLineage);

    // A lot being CREATED by this very operation has no lineage row yet — the cores write their
    // LotLineage edges after the ledger write (blend-core does). Its parentage is still knowable:
    // it is right here in the same operation. The lots this op CONSUMED (net-negative across the
    // cellar) are exactly what the new wine is made of, weighted by how much of each went in.
    const netByLot = new Map<string, number>();
    for (const l of lines) {
      if (!l.vesselId) continue;
      netByLot.set(l.lotId, round2((netByLot.get(l.lotId) ?? 0) + l.deltaL));
    }
    const consumed = [...netByLot.entries()].filter(([, net]) => net < -1e-9);
    const consumedTotal = consumed.reduce((a, [, net]) => a + Math.abs(net), 0);
    const gained = [...netByLot.entries()].filter(([, net]) => net > 1e-9);
    const gainedTotal = gained.reduce((a, [, net]) => a + net, 0);

    // This fold applies DELTAS, so the two directions are attributed differently:
    //   • wine LEAVING draws down what is already in the vessel → the lot's own makeup;
    //   • wine ARRIVING is whatever this operation consumed to produce it → the in-op parents.
    // Using one attribution for both is what made a GROW_EXISTING absorb wrong: the +625 L that
    // arrived is Cabernet, even though the lot receiving it is a Syrah lot.
    //
    // ⚠️ ONLY on ops that actually CHANGE a wine's identity. On a CORRECTION the wine is going
    // back where it came from and keeps its own makeup — attributing it to "whatever this op
    // consumed" made a reversal credit the returning Cabernet to Syrah, so reverting and
    // re-applying a collapse silently lost the Cabernet. TOPPING is excluded on purpose too: a
    // top-up deliberately does not restate composition (Unit 7).
    const identityChanging = opType === "BLEND" || opType === "PRESS" || opType === "SAIGNEE" || opType === "CRUSH";
    const leafIds = new Set<string>();
    const expand = (lotId: string) => composeLeaves(lotId, edges).leaves;
    // What this op consumed, expanded through each parent's OWN lineage so a blend of a blend
    // reaches real origins instead of stopping at the intermediate lot.
    const incomingLeaves = (forLotId: string) =>
      consumed
        .filter(([parentId]) => parentId !== forLotId)
        .flatMap(([parentId, net]) =>
          expand(parentId).map((leaf) => ({ lotId: leaf.lotId, weight: (leaf.weight * Math.abs(net)) / consumedTotal })),
        );

    // A CORRECTION hands wine BACK, so the volume leaving is specifically the wine that arrived —
    // not a proportional slice of the blend it briefly joined. Mirror of the rule above: the
    // identity comes from the lot RECEIVING the return. Without this, reverting an absorb drew
    // the resident down proportionally and permanently smeared the two wines together.
    const returningLeaves = (forLotId: string) =>
      gained
        .filter(([gainerId]) => gainerId !== forLotId)
        .flatMap(([gainerId, net]) => expand(gainerId).map((leaf) => ({ lotId: leaf.lotId, weight: (leaf.weight * net) / gainedTotal })));

    for (const lotId of needLineage) {
      const own = expand(lotId);
      const net = netByLot.get(lotId) ?? 0;
      let directional: { lotId: string; weight: number }[] = [];
      if (identityChanging && net > 1e-9 && consumedTotal > 0) {
        directional = incomingLeaves(lotId); // wine arriving from what this op consumed
      } else if (opType === "CORRECTION" && net < -1e-9 && gainedTotal > 0) {
        directional = returningLeaves(lotId); // wine going back to whoever is receiving it
      }
      leafShares.set(lotId, own);
      if (directional.length > 0) directionalShares.set(lotId, { sign: net > 0 ? 1 : -1, leaves: directional });
      for (const leaf of [...own, ...directional]) leafIds.add(leaf.lotId);
    }

    // The leaves are ancestors, so their origins were not in the first query.
    const missing = [...leafIds].filter((id) => !originById.has(id));
    if (missing.length > 0) {
      const ancestors = await tx.lot.findMany({
        where: { id: { in: missing } },
        select: { id: true, originVarietyId: true, originVineyardId: true, vintageYear: true },
      });
      for (const a of ancestors) originById.set(a.id, a);
    }
  }

  type CompDelta = { vesselId: string; varietyId: string; vineyardId: string; vintage: number; delta: number };
  const deltas = new Map<string, CompDelta>();
  const addDelta = (vesselId: string, o: { originVarietyId: string; originVineyardId: string; vintageYear: number }, deltaL: number) => {
    const key = `${vesselId}::${o.originVarietyId}::${o.originVineyardId}::${o.vintageYear}`;
    const cur = deltas.get(key);
    if (cur) cur.delta = round2(cur.delta + deltaL);
    else
      deltas.set(key, {
        vesselId,
        varietyId: o.originVarietyId,
        vineyardId: o.originVineyardId,
        vintage: o.vintageYear,
        delta: deltaL,
      });
  };

  for (const line of lines) {
    if (!line.vesselId) continue;
    // Wine arriving into a lot that gained volume from other lots in THIS op is made of those
    // lots; anything else is the lot's own makeup (its ancestry, or its own origin if it has no
    // parents). A leaf with no origin tuple is genuinely unattributable — that share is left out
    // and the lot's provenanceComplete: false is what tells the UI to say so.
    // Apply the directional attribution only to lines running in that direction; the other side
    // of the same lot (a heel, a loss leg) still draws on the lot’s own makeup.
    const directional = directionalShares.get(line.lotId);
    const useDirectional = directional && Math.sign(line.deltaL) === directional.sign;
    const shares = (useDirectional ? directional!.leaves : undefined) ?? leafShares.get(line.lotId) ?? [];
    for (const leaf of shares) {
      const leafOrigin = originById.get(leaf.lotId);
      if (!hasTuple(leafOrigin)) continue;
      addDelta(line.vesselId, leafOrigin, round2(line.deltaL * leaf.weight));
    }
  }

  const material = [...deltas.values()].filter((c) => Math.abs(c.delta) >= 1e-9);
  if (material.length === 0) return;

  // One read for every touched tuple, then batched writes — this used to be a findFirst + write
  // per tuple, awaited in series, inside a SERIALIZABLE tx with a 20s ceiling. Blend attribution
  // multiplies the tuple count, so the round trips were about to matter.
  const existingRows = await tx.vesselComponent.findMany({
    where: { OR: material.map((c) => ({ vesselId: c.vesselId, varietyId: c.varietyId, vineyardId: c.vineyardId, vintage: c.vintage })) },
    select: { id: true, vesselId: true, varietyId: true, vineyardId: true, vintage: true, volumeL: true },
  });
  const existingByKey = new Map(
    existingRows.map((r) => [`${r.vesselId}::${r.varietyId}::${r.vineyardId}::${r.vintage}`, r]),
  );

  const toDelete: string[] = [];
  const toCreate: { tenantId: string; vesselId: string; varietyId: string; vineyardId: string; vintage: number; volumeL: number }[] = [];
  const toUpdate: { id: string; volumeL: number }[] = [];

  for (const c of material) {
    const existing = existingByKey.get(`${c.vesselId}::${c.varietyId}::${c.vineyardId}::${c.vintage}`);
    const next = round2((existing ? num(existing.volumeL) : 0) + c.delta);
    if (next <= FUNCTIONAL_ZERO_L) {
      if (existing) toDelete.push(existing.id);
    } else if (existing) {
      toUpdate.push({ id: existing.id, volumeL: next });
    } else {
      toCreate.push({ tenantId, vesselId: c.vesselId, varietyId: c.varietyId, vineyardId: c.vineyardId, vintage: c.vintage, volumeL: next });
    }
  }

  if (toDelete.length > 0) await tx.vesselComponent.deleteMany({ where: { id: { in: toDelete } } });
  if (toCreate.length > 0) await tx.vesselComponent.createMany({ data: toCreate });
  for (const u of toUpdate) {
    await tx.vesselComponent.update({ where: { id: u.id }, data: { volumeL: u.volumeL } });
  }
}
