import { computeProportionalDraw, round2 } from "@/lib/bottling/draw";
import { FUNCTIONAL_ZERO_L, type LineReason } from "@/lib/ledger/vocabulary";

// Pure ledger math for the bulk-wine operation ledger (Phase 1 spine). No server
// imports, so it's unit-tested directly. All volume math goes through the centiliter /
// largest-remainder helpers in bottling/draw so sums are exact (no float drift) —
// see VISION D14 and docs/INVARIANTS.md.

const EPS = 1e-9;

/**
 * A signed volumetric ledger line. `vesselId === null` is the "outside the cellar"
 * counter-account (seed-in, loss-out, bottle-out) that keeps every operation balanced.
 * `deltaL` is the change to that location's holdings: + into it, - out of it.
 */
export type LedgerLine = {
  lotId: string;
  vesselId: string | null;
  deltaL: number;
  reason?: LineReason;
};

/** A row of the current-state projection: how much of one lot sits in one vessel. */
export type VesselLotBalance = { vesselId: string; lotId: string; volumeL: number };

export const balanceKey = (vesselId: string, lotId: string) => `${vesselId}::${lotId}`;

/** True if an operation's lines conserve volume (signed deltas sum to ~0). */
export function isBalanced(lines: LedgerLine[]): boolean {
  return Math.abs(lines.reduce((a, l) => a + l.deltaL, 0)) < 1e-6;
}

export function assertBalanced(lines: LedgerLine[]): void {
  if (!isBalanced(lines)) {
    const total = round2(lines.reduce((a, l) => a + l.deltaL, 0));
    throw new Error(`Ledger operation is not balanced: lines sum to ${total} L, expected 0.`);
  }
}

/**
 * Apply an operation's lines to the current projection and return the new balances.
 * Only in-vessel lines (vesselId != null) touch the projection; null-vessel lines are
 * the external counter-account. A residual at/below FUNCTIONAL_ZERO_L is swept to 0
 * (the row drops). Throws if a balance would go negative beyond the dust threshold.
 */
export function foldLines(balances: VesselLotBalance[], lines: LedgerLine[]): VesselLotBalance[] {
  const map = new Map<string, VesselLotBalance>();
  for (const b of balances) map.set(balanceKey(b.vesselId, b.lotId), { ...b });

  for (const line of lines) {
    if (line.vesselId === null) continue; // external counter-account, not projected
    const k = balanceKey(line.vesselId, line.lotId);
    const cur = map.get(k);
    const next = round2((cur?.volumeL ?? 0) + line.deltaL);
    if (next < -FUNCTIONAL_ZERO_L) {
      throw new Error(`Ledger fold would drive ${k} negative (${next} L).`);
    }
    if (next <= FUNCTIONAL_ZERO_L) {
      map.delete(k); // functional zero — sweep the dust row
    } else {
      map.set(k, { vesselId: line.vesselId, lotId: line.lotId, volumeL: next });
    }
  }
  return [...map.values()];
}

export type RackPlan = {
  drawL: number;
  lossL: number;
  addedL: number; // into the destination = drawL - lossL
  lines: LedgerLine[];
};

/**
 * Plan a rack of `drawL` liters out of the source vessel into `toVesselId`, losing
 * `lossL` to lees. Draw is split proportionally across the source's lots; loss is
 * spread proportionally over the moved volume and recorded as an external line, so the
 * operation balances per lot (-deduct from source, +(deduct-loss) into dest, +loss
 * external). Throws on bad volumes (mirrors planTransfer).
 */
export function planLedgerRack(
  source: VesselLotBalance[],
  toVesselId: string,
  drawL: number,
  lossL = 0,
): RackPlan {
  if (!(drawL > 0)) throw new Error("Transfer volume must be greater than 0.");
  if (lossL < 0) throw new Error("Loss can't be negative.");
  if (lossL > drawL + EPS) throw new Error("Loss can't exceed the transfer volume.");
  if (source.length === 0) throw new Error("Source vessel is empty.");

  const fromVesselId = source[0].vesselId; // all source rows share the source vessel
  const deductions = computeProportionalDraw(
    source.map((b) => ({ id: b.lotId, volumeL: b.volumeL })),
    drawL,
  );
  const moved = deductions.filter((d) => d.deduct > 0);
  const lossPortions =
    lossL > 0
      ? computeProportionalDraw(moved.map((d) => ({ id: d.id, volumeL: d.deduct })), lossL)
      : [];
  const lostById = new Map(lossPortions.map((l) => [l.id, l.deduct]));

  const lines: LedgerLine[] = [];
  for (const d of moved) {
    const lostForLot = lostById.get(d.id) ?? 0;
    const intoDest = round2(d.deduct - lostForLot);
    lines.push({ lotId: d.id, vesselId: fromVesselId, deltaL: -d.deduct });
    if (intoDest > 0) lines.push({ lotId: d.id, vesselId: toVesselId, deltaL: intoDest });
    if (lostForLot > 0)
      lines.push({ lotId: d.id, vesselId: null, deltaL: round2(lostForLot), reason: "loss" });
  }
  assertBalanced(lines);
  return { drawL: round2(drawL), lossL: round2(lossL), addedL: round2(drawL - lossL), lines };
}

export type VesselLossPlan = {
  removedL: number;
  lines: LedgerLine[];
  perLot: { lotId: string; removedL: number }[];
};

/**
 * Plan a pure volume LOSS out of a vessel (filtration loss, evaporation/angel's share):
 * `removeL` leaves the system, split proportionally across the vessel's lots, each as a
 * matched pair (- out of the vessel, + to the external counter-account with `reason`), so
 * the op balances per lot. Volume only leaves — it does NOT move to another vessel. Throws
 * on a non-positive amount or one exceeding what the vessel holds. (Phase 3.)
 */
export function planVesselLoss(
  source: VesselLotBalance[],
  removeL: number,
  reason: LineReason,
): VesselLossPlan {
  if (!(removeL > 0)) throw new Error("Loss volume must be greater than 0.");
  if (source.length === 0) throw new Error("Vessel is empty.");
  const fromVesselId = source[0].vesselId;
  const total = round2(source.reduce((a, b) => a + b.volumeL, 0));
  if (removeL > total + EPS) throw new Error(`Can't remove ${removeL} L — the vessel holds ${total} L.`);

  const shares = computeProportionalDraw(
    source.map((b) => ({ id: b.lotId, volumeL: b.volumeL })),
    removeL,
  );
  const lines: LedgerLine[] = [];
  const perLot: { lotId: string; removedL: number }[] = [];
  for (const s of shares) {
    if (s.deduct <= 0) continue;
    lines.push({ lotId: s.id, vesselId: fromVesselId, deltaL: round2(-s.deduct) });
    lines.push({ lotId: s.id, vesselId: null, deltaL: round2(s.deduct), reason });
    perLot.push({ lotId: s.id, removedL: round2(s.deduct) });
  }
  assertBalanced(lines);
  return { removedL: round2(removeL), lines, perLot };
}

export type CorrectionPlan =
  | { ok: true; lines: LedgerLine[] }
  | { ok: false; reason: "downstream-activity"; blockedKeys: string[] }
  | { ok: false; reason: "shortfall"; shortfalls: { key: string; need: number; have: number }[] };

/**
 * Plan a compensating correction of a prior operation (VISION D6/D15). Refuses if any
 * later non-correction op touched the affected (vessel, lot) positions — a
 * mathematically-valid inverse could otherwise silently rewrite a composition that
 * downstream work already depended on. `touchedKeys` = balanceKey()s mutated by later
 * ops. Originals are never deleted; this only emits the inverse lines.
 */
export function planCorrection(
  originalLines: LedgerLine[],
  currentBalances: VesselLotBalance[],
  touchedKeys: ReadonlySet<string>,
): CorrectionPlan {
  const affected = originalLines
    .filter((l) => l.vesselId !== null)
    .map((l) => balanceKey(l.vesselId as string, l.lotId));
  const blockedKeys = [...new Set(affected)].filter((k) => touchedKeys.has(k));
  if (blockedKeys.length > 0) return { ok: false, reason: "downstream-activity", blockedKeys };

  const inverse = originalLines.map((l) => ({ ...l, deltaL: round2(-l.deltaL) }));

  // Defensive: the inverse must not drive any current balance negative.
  const balByKey = new Map(currentBalances.map((b) => [balanceKey(b.vesselId, b.lotId), b.volumeL]));
  const shortfalls: { key: string; need: number; have: number }[] = [];
  for (const l of inverse) {
    if (l.vesselId === null || l.deltaL >= 0) continue;
    const key = balanceKey(l.vesselId, l.lotId);
    const have = balByKey.get(key) ?? 0;
    if (have + l.deltaL < -EPS) shortfalls.push({ key, need: round2(-l.deltaL), have });
  }
  if (shortfalls.length > 0) return { ok: false, reason: "shortfall", shortfalls };
  return { ok: true, lines: inverse };
}
