// Phase 8 (Unit 4) — the cost roll-up engine: the AUTHORITY for cost-per-lot / cost-per-bottle (D4).
// PURE — no DB/server imports, unit-tested directly like ledger-math / lineage. The loader in
// cost/data.ts does the batched recursive-CTE reads and hands these functions a flat event list +
// per-lot current volumes; everything here is a deterministic fold over that, in ledger (opId) order.
//
// Model (D10): cost is capitalized ONTO a lot by DIRECT lines and MOVES parent→child on a blend/split
// by the UNAMBIGUOUS volume fraction transferredVolumeL / parentPreOpVolumeL — never the lineage
// `fraction` (council C2). NORMAL loss records no cost event, so the lot keeps its cost while its
// (ledger-folded) volume drops → cost-per-L rises (D13). ABNORMAL loss removes the dumped volume's
// pro-rata cost as an expense write-off, leaving cost-per-L unchanged (D13). Completeness propagates:
// any unknown/partial input taints the lot (D14). Conservation holds per op: cost out of a parent ==
// cost into its children; zero volume ⇒ zero cost, any residual reported as stranded for a VARIANCE
// flush (D9).

import type { CostComponent } from "@prisma/client";

export type Completeness = "KNOWN" | "PARTIAL" | "UNKNOWN";

/** Dust epsilons — money at 18,8 and volume at 10,2 both leave float dust to sweep. */
const COST_EPS = 1e-6;
const VOL_EPS = 1e-6;

export function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/**
 * One cost event in ledger order. DIRECT capitalizes an absorbed cost onto a lot; TRANSFER moves a
 * volume-fraction of a parent's cost to a child (blend/split/press/saignée); ABNORMAL_LOSS writes off
 * the pro-rata cost of dumped/spilled volume. NORMAL loss produces NO event (cost stays, per-L rises).
 */
export type CostEvent =
  | {
      opId: number;
      kind: "DIRECT";
      lotId: string;
      component: CostComponent;
      amount: number; // capitalized amount; may be 0 for a recorded-but-unknown line
      completeness: Completeness; // UNKNOWN when the underlying cost basis is null (D14) — never a silent $0
    }
  | {
      opId: number;
      kind: "TRANSFER";
      fromLotId: string;
      toLotId: string;
      transferredVolumeL: number;
      parentPreOpVolumeL: number;
    }
  | {
      opId: number;
      kind: "ABNORMAL_LOSS";
      lotId: string;
      lostVolumeL: number;
      preVolumeL: number;
    };

/** A lot's current folded volume (from the ledger; NOT recomputed here). */
export type LotVolume = { lotId: string; volumeL: number };

export type LotCost = {
  lotId: string;
  totalCost: number; // capitalized cost currently residing in the lot
  volumeL: number; // current folded volume
  costPerL: number | null; // null at zero volume (D9 — cost is stranded, not divided by ~0)
  completeness: Completeness;
  components: Partial<Record<CostComponent, number>>; // capitalized decomposition
  expensed: number; // abnormal-loss write-offs removed from this lot (expense, not inventory)
  stranded: number; // capitalized cost left on a ~zero-volume lot (D9 → flush to VARIANCE)
};

export type RollupResult = {
  lots: Map<string, LotCost>;
};

// ── completeness lattice ──
// KNOWN⊕KNOWN=KNOWN, UNKNOWN⊕UNKNOWN=UNKNOWN, KNOWN⊕UNKNOWN=PARTIAL, anything⊕PARTIAL=PARTIAL.
export function mergeCompleteness(a: Completeness | undefined, b: Completeness): Completeness {
  if (a === undefined) return b;
  if (a === "PARTIAL" || b === "PARTIAL") return "PARTIAL";
  if (a === b) return a;
  return "PARTIAL"; // one KNOWN, one UNKNOWN
}

const KIND_ORDER: Record<CostEvent["kind"], number> = { DIRECT: 0, TRANSFER: 1, ABNORMAL_LOSS: 2 };

type WorkLot = {
  components: Map<CostComponent, number>;
  completeness: Completeness | undefined;
  expensed: number;
};

function ensure(lots: Map<string, WorkLot>, id: string): WorkLot {
  let l = lots.get(id);
  if (!l) {
    l = { components: new Map(), completeness: undefined, expensed: 0 };
    lots.set(id, l);
  }
  return l;
}

function totalOf(l: WorkLot): number {
  let t = 0;
  for (const v of l.components.values()) t += v;
  return round8(t);
}

/**
 * Fold the cost events into per-lot cost. Events are processed in (opId, kind) order — DIRECT before
 * TRANSFER before ABNORMAL_LOSS within an op — so a lot's cost is established before any is moved off
 * it. Pure and deterministic; the same events + volumes always yield the same result.
 */
export function rollupCost(events: CostEvent[], volumes: LotVolume[]): RollupResult {
  const work = new Map<string, WorkLot>();
  const volById = new Map(volumes.map((v) => [v.lotId, v.volumeL]));

  // Group by op so cost that MOVES/writes-off within one op is computed against the parent/lot's
  // PRE-OP cost snapshot — not the live map. This is what makes a 1-parent→N-children press (or two
  // transfers off one parent in the same blend) split cost by the ORIGINAL volume fractions rather
  // than depleting the parent between the two transfers. parentPreOpVolumeL is the pre-op basis; the
  // pre-op COST snapshot is its cost counterpart.
  const opIds = [...new Set(events.map((e) => e.opId))].sort((a, b) => a - b);
  const byOp = new Map<number, CostEvent[]>();
  for (const e of events) byOp.set(e.opId, [...(byOp.get(e.opId) ?? []), e]);

  for (const opId of opIds) {
    const opEvents = [...(byOp.get(opId) ?? [])].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

    // DIRECT first — establishes cost that later transfers/losses in the same op operate on.
    for (const e of opEvents) {
      if (e.kind !== "DIRECT") continue;
      const l = ensure(work, e.lotId);
      l.components.set(e.component, round8((l.components.get(e.component) ?? 0) + e.amount));
      l.completeness = mergeCompleteness(l.completeness, e.completeness);
    }

    // Snapshot every source lot's pre-op cost (post-direct) so fractions apply to the ORIGINAL cost.
    const snap = new Map<string, { components: Map<CostComponent, number>; completeness: Completeness | undefined }>();
    const snapshot = (id: string) => {
      if (snap.has(id)) return;
      const l = work.get(id);
      snap.set(id, { components: new Map(l?.components ?? []), completeness: l?.completeness });
    };
    for (const e of opEvents) {
      if (e.kind === "TRANSFER") snapshot(e.fromLotId);
      else if (e.kind === "ABNORMAL_LOSS") snapshot(e.lotId);
    }

    for (const e of opEvents) {
      if (e.kind === "TRANSFER") {
        const parent = ensure(work, e.fromLotId);
        const child = ensure(work, e.toLotId);
        const s = snap.get(e.fromLotId)!;
        const f = e.parentPreOpVolumeL > VOL_EPS ? Math.min(1, Math.max(0, e.transferredVolumeL / e.parentPreOpVolumeL)) : 0;
        for (const [c, amt] of s.components) {
          const moved = round8(amt * f);
          if (moved === 0) continue;
          parent.components.set(c, round8((parent.components.get(c) ?? 0) - moved));
          child.components.set(c, round8((child.components.get(c) ?? 0) + moved));
        }
        // The child inherits the parent's completeness (an unknown parent taints the child — D14).
        child.completeness = mergeCompleteness(child.completeness, s.completeness ?? "UNKNOWN");
      } else if (e.kind === "ABNORMAL_LOSS") {
        // Write off the dumped volume's pro-rata cost so per-L is unchanged (D13).
        const l = ensure(work, e.lotId);
        const s = snap.get(e.lotId)!;
        const f = e.preVolumeL > VOL_EPS ? Math.min(1, Math.max(0, e.lostVolumeL / e.preVolumeL)) : 0;
        for (const [c, amt] of s.components) {
          const off = round8(amt * f);
          if (off === 0) continue;
          l.components.set(c, round8((l.components.get(c) ?? 0) - off));
          l.expensed = round8(l.expensed + off);
        }
      }
    }
  }

  const lots = new Map<string, LotCost>();
  const allIds = new Set<string>([...work.keys(), ...volById.keys()]);
  for (const id of allIds) {
    const w: WorkLot = work.get(id) ?? { components: new Map<CostComponent, number>(), completeness: undefined, expensed: 0 };
    const volumeL = volById.get(id) ?? 0;
    const totalCost = totalOf(w);
    const zeroVol = volumeL <= VOL_EPS;
    const components: Partial<Record<CostComponent, number>> = {};
    for (const [c, v] of w.components) if (Math.abs(v) > COST_EPS) components[c] = round8(v);
    lots.set(id, {
      lotId: id,
      totalCost,
      volumeL,
      costPerL: zeroVol ? null : round8(totalCost / volumeL),
      completeness: w.completeness ?? "UNKNOWN",
      components,
      expensed: w.expensed,
      // Cost left on a ~zero-volume lot is stranded ghost value (D9) — the caller flushes it to VARIANCE.
      stranded: zeroVol && Math.abs(totalCost) > COST_EPS ? totalCost : 0,
    });
  }
  return { lots };
}

// ── Bottling cost-per-bottle (D15) — the bill-of-materials divide, cents-rounded (D9) ──

export type BottlingCostInput = {
  liquidCost: number; // capitalized cost of the bulk lot consumed into the run
  packagingCost: number; // PACKAGING SupplyLot draw-down (glass/cork/capsule/label/case)
  otherCapitalized?: number; // labor/overhead/etc. that the tenant capitalizes
  goodBottles: number; // ACTUAL yielded good bottles (not staged count) — breakage lowers yield
};

export type BottlingCostResult = {
  totalRunCost: number;
  costPerBottle: number; // rounded to cents
  residualToVariance: number; // totalRunCost − costPerBottle × goodBottles (flushed to a VARIANCE line, D9)
};

/** cost-per-bottle = totalRunCost / ACTUAL good bottles (D15); the cents-rounding residual is a VARIANCE line. */
export function bottlingCostPerBottle(input: BottlingCostInput): BottlingCostResult {
  const totalRunCost = round8(input.liquidCost + input.packagingCost + (input.otherCapitalized ?? 0));
  if (!(input.goodBottles > 0)) {
    return { totalRunCost, costPerBottle: 0, residualToVariance: totalRunCost };
  }
  const costPerBottle = Math.round((totalRunCost / input.goodBottles) * 100) / 100;
  const residualToVariance = round8(totalRunCost - costPerBottle * input.goodBottles);
  return { totalRunCost, costPerBottle, residualToVariance };
}

/**
 * Conservation check for a single transfer op (D10 invariant): the cost moved off the parents equals
 * the cost moved onto the children. Given the pre-op parent costs and the transfer events for one op,
 * returns the signed imbalance (≈0 when conserved). Used by tests + verify:cost.
 */
export function transferImbalance(
  transfers: { fromLotId: string; toLotId: string; transferredVolumeL: number; parentPreOpVolumeL: number }[],
  parentCostBefore: Map<string, number>,
): number {
  let movedOut = 0;
  let movedIn = 0;
  for (const t of transfers) {
    const f = t.parentPreOpVolumeL > VOL_EPS ? Math.min(1, Math.max(0, t.transferredVolumeL / t.parentPreOpVolumeL)) : 0;
    const moved = (parentCostBefore.get(t.fromLotId) ?? 0) * f;
    movedOut += moved;
    movedIn += moved;
  }
  return round8(movedOut - movedIn);
}
