import { computeProportionalDraw, round2 } from "@/lib/bottling/draw";
import { FUNCTIONAL_ZERO_L, type LineReason } from "@/lib/ledger/vocabulary";

// Pure ledger math for the bulk-wine operation ledger (Phase 1 spine). No server
// imports, so it's unit-tested directly. All volume math goes through the centiliter /
// largest-remainder helpers in bottling/draw so sums are exact (no float drift) —
// see VISION D14 and docs/INVARIANTS.md.

const EPS = 1e-9;

/** kg is recorded at Decimal(12,3); yield ratios carry a little more precision. Volume math
 * still goes through round2 (centiliters) so ledger lines stay exact. */
const round3 = (n: number) => Math.round(n * 1e3) / 1e3;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

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

export type BlendComponentDraw = { vesselId: string; lotId: string; drawL: number };

/** One destination of a split blend: how much of the (single) child lot lands in this vessel. */
export type BlendDestination = { vesselId: string; volumeL: number };

export type BlendPlan = {
  lines: LedgerLine[];
  childTotalL: number; // into the destination(s) = Σdraw − loss
  lossL: number;
  // Gross INPUT share per DISTINCT parent lot (council S1, loss-independent; council C2 —
  // the same lot drawn from two vessels collapses into ONE entry). Drives lineage fractions.
  parentGrossByLot: { lotId: string; grossL: number }[];
};

/**
 * The source (draw) side of a blend, shared by `planBlend` (one destination) and
 * `planBlendSplit` (many). Builds one `-drawL` line per component (validated against the live
 * balance — partial draws are fine, leaving the remainder), aggregates gross shares per
 * DISTINCT parent lot, and computes the net child volume (`Σdraw − loss`). The caller adds the
 * destination `+` line(s) and the optional external loss line, then asserts balance.
 */
function planBlendSources(
  components: BlendComponentDraw[],
  lossL: number,
  sourceBalances: VesselLotBalance[],
): { sourceLines: LedgerLine[]; grossTotal: number; childTotalL: number; lossL: number; parentGrossByLot: { lotId: string; grossL: number }[] } {
  if (components.length === 0) throw new Error("A blend needs at least one source.");
  if (lossL < 0) throw new Error("Loss can't be negative.");

  const balByKey = new Map(sourceBalances.map((b) => [balanceKey(b.vesselId, b.lotId), b.volumeL]));
  const sourceLines: LedgerLine[] = [];
  const grossByLot = new Map<string, number>();
  let grossTotal = 0;

  for (const c of components) {
    if (!(c.drawL > 0)) throw new Error("Each blend draw must be greater than 0.");
    const have = balByKey.get(balanceKey(c.vesselId, c.lotId)) ?? 0;
    if (c.drawL > have + EPS) {
      throw new Error(`Can't draw ${c.drawL} L — that lot holds ${round2(have)} L in that vessel.`);
    }
    sourceLines.push({ lotId: c.lotId, vesselId: c.vesselId, deltaL: round2(-c.drawL) });
    grossByLot.set(c.lotId, round2((grossByLot.get(c.lotId) ?? 0) + c.drawL));
    grossTotal = round2(grossTotal + c.drawL);
  }

  if (lossL > grossTotal + EPS) throw new Error("Loss can't exceed the total drawn.");
  const childTotalL = round2(grossTotal - lossL);
  if (!(childTotalL > 0)) throw new Error("A blend must yield a positive volume.");

  return {
    sourceLines,
    grossTotal,
    childTotalL,
    lossL: round2(lossL),
    parentGrossByLot: [...grossByLot.entries()].map(([lotId, grossL]) => ({ lotId, grossL })),
  };
}

/**
 * Plan a BLEND (Phase 5): draw `drawL` from each component (vessel, lot) position into a
 * single child lot in `toVesselId`, losing `lossL` to the external counter-account.
 * Generalizes planLedgerRack from 1 source → N. Each component is a `-drawL` line (validated
 * against the live balance — partial draws are fine, leaving the remainder); the child gets
 * one `+(Σdraw − loss)` line; an optional `+loss` external line balances it. Gross shares are
 * aggregated per DISTINCT parent lot so a lot drawn from two vessels is one parent. Throws on
 * a non-positive draw, an over-draw, or a loss exceeding the total drawn.
 */
export function planBlend(
  components: BlendComponentDraw[],
  toVesselId: string,
  childLotId: string,
  lossL: number,
  sourceBalances: VesselLotBalance[],
): BlendPlan {
  const s = planBlendSources(components, lossL, sourceBalances);
  const lines: LedgerLine[] = [...s.sourceLines, { lotId: childLotId, vesselId: toVesselId, deltaL: s.childTotalL }];
  if (s.lossL > 0) {
    lines.push({ lotId: childLotId, vesselId: null, deltaL: s.lossL, reason: "loss" });
  }
  assertBalanced(lines);
  return { lines, childTotalL: s.childTotalL, lossL: s.lossL, parentGrossByLot: s.parentGrossByLot };
}

/**
 * Plan a BLEND that lands the single child lot in MORE THAN ONE destination vessel — one wine
 * (one lot) split across N vessels (e.g. assemble, then barrel down). Same source/draw side as
 * `planBlend`; the child gets one `+volumeL` line per destination, and those volumes MUST sum
 * to the net blended volume (`Σdraw − loss`). Throws on a non-positive destination volume or a
 * split that doesn't reconcile with the drawn total.
 */
export function planBlendSplit(
  components: BlendComponentDraw[],
  destinations: BlendDestination[],
  childLotId: string,
  lossL: number,
  sourceBalances: VesselLotBalance[],
): BlendPlan {
  if (destinations.length === 0) throw new Error("A blend needs at least one destination.");
  const s = planBlendSources(components, lossL, sourceBalances);
  const lines: LedgerLine[] = [...s.sourceLines];
  let destTotal = 0;
  for (const d of destinations) {
    if (!(d.volumeL > 0)) throw new Error("Each destination volume must be greater than 0.");
    destTotal = round2(destTotal + d.volumeL);
    lines.push({ lotId: childLotId, vesselId: d.vesselId, deltaL: round2(d.volumeL) });
  }
  // Must reconcile EXACTLY (both sides are centiliter-rounded) or the op won't balance.
  if (Math.abs(destTotal - s.childTotalL) > EPS) {
    throw new Error(`Destination volumes (${destTotal} L) must sum to the blended volume (${s.childTotalL} L).`);
  }
  if (s.lossL > 0) {
    lines.push({ lotId: childLotId, vesselId: null, deltaL: s.lossL, reason: "loss" });
  }
  assertBalanced(lines);
  return { lines, childTotalL: s.childTotalL, lossL: s.lossL, parentGrossByLot: s.parentGrossByLot };
}

// ───────────────────────── Phase 6: crush & press (state transforms) ─────────────────────────

/** One harvest pick consumed by a crush, with the data needed to guard partial consumption. */
export type CrushPickDraw = {
  pickId: string;
  consumedKg: number; // kg taken from this pick into THIS crush
  weightKg: number; // the pick's total weight
  alreadyConsumedKg: number; // Σ consumedKg already recorded against this pick (other lots/crushes)
};

export type CrushPlan = {
  lines: LedgerLine[];
  outputVolumeL: number;
  totalConsumedKg: number;
  yieldLPerKg: number; // MEASURED yield — output liters ÷ kg consumed (D8: never arithmetic kg→L)
  yieldLPerTonne: number; // the winemaker-facing figure (~600–750 L/t)
};

/**
 * Plan a CRUSH (Phase 6): consume `consumedKg` from each pick and ORIGINATE `outputVolumeL`
 * of must into `destVesselId` under `mustLotId` (a new OR an existing must lot — the caller
 * decides identity). kg NEVER enters a ledger line (D8); it is op metadata. The only balanced
 * lines are the measured output `+V` into the vessel and a `−V` counter-leg typed
 * `crush_origination` (origination-from-harvest, EXCLUDED from loss — council S8). Yield is
 * DERIVED from the measured output, not from kg. Guards: each consumedKg > 0 and ≤ the pick's
 * remaining (`weightKg − alreadyConsumedKg`); `outputVolumeL > 0`.
 */
export function planCrush(
  picks: CrushPickDraw[],
  destVesselId: string,
  mustLotId: string,
  outputVolumeL: number,
): CrushPlan {
  if (picks.length === 0) throw new Error("A crush needs at least one harvest pick.");
  if (!(outputVolumeL > 0)) throw new Error("Measured output volume must be greater than 0.");

  let totalConsumedKg = 0;
  for (const p of picks) {
    if (!(p.consumedKg > 0)) throw new Error("Each pick's consumed kg must be greater than 0.");
    const remaining = round3(p.weightKg - p.alreadyConsumedKg);
    if (p.consumedKg > remaining + EPS) {
      throw new Error(
        `Can't consume ${p.consumedKg} kg from pick ${p.pickId} — only ${remaining} kg remain of its ${p.weightKg} kg.`,
      );
    }
    totalConsumedKg = round3(totalConsumedKg + p.consumedKg);
  }
  if (!(totalConsumedKg > 0)) throw new Error("A crush must consume a positive weight of fruit.");

  const out = round2(outputVolumeL);
  const lines: LedgerLine[] = [
    { lotId: mustLotId, vesselId: destVesselId, deltaL: out },
    { lotId: mustLotId, vesselId: null, deltaL: round2(-out), reason: "crush_origination" },
  ];
  assertBalanced(lines);

  // Both yields derive from the raw measured ratio (don't compound the rounded per-kg value).
  const ratio = out / totalConsumedKg;
  return {
    lines,
    outputVolumeL: out,
    totalConsumedKg,
    yieldLPerKg: round4(ratio),
    yieldLPerTonne: round2(ratio * 1000),
  };
}

export type PressFractionDraw = {
  childLotId: string; // the destination lot (new child OR an existing lot being merged into)
  destVesselId: string;
  volumeL: number;
};

export type PressPlan = {
  lines: LedgerLine[];
  drawnL: number; // total pulled out of the parent = Σfraction + lees
  fractionTotalL: number;
  lossL: number; // lees / skins
};

/**
 * Plan a PRESS (Phase 6): the inverse of a blend — ONE parent lot/vessel position drawn down
 * into N child fraction lots (free-run, light, hard press), with lees/skins as a typed `loss`
 * line. Each fraction lands `volumeL` in its destination vessel under its (new or merged) child
 * lot. The parent gives up `Σfraction + lees`; balance holds per the conservation law. Guards:
 * ≥1 fraction, each volume > 0, lees ≥ 0, and total drawn ≤ what the parent holds. SAIGNEE is
 * the same plan run pre-ferment (a single juice fraction bled off a must lot).
 */
export function planPress(
  parentLotId: string,
  parentVesselId: string,
  parentAvailableL: number,
  fractions: PressFractionDraw[],
  lossL = 0,
): PressPlan {
  if (fractions.length === 0) throw new Error("A press needs at least one fraction.");
  if (lossL < 0) throw new Error("Lees/skins loss can't be negative.");

  let fractionTotalL = 0;
  const fractionLines: LedgerLine[] = [];
  for (const f of fractions) {
    if (!(f.volumeL > 0)) throw new Error("Each press fraction volume must be greater than 0.");
    fractionTotalL = round2(fractionTotalL + f.volumeL);
    fractionLines.push({ lotId: f.childLotId, vesselId: f.destVesselId, deltaL: round2(f.volumeL) });
  }
  const drawnL = round2(fractionTotalL + lossL);
  if (!(drawnL > 0)) throw new Error("A press must move a positive volume.");
  if (drawnL > round2(parentAvailableL) + EPS) {
    throw new Error(`Can't press ${drawnL} L — the parent lot holds ${round2(parentAvailableL)} L.`);
  }

  const lines: LedgerLine[] = [
    { lotId: parentLotId, vesselId: parentVesselId, deltaL: round2(-drawnL) },
    ...fractionLines,
  ];
  if (lossL > 0) lines.push({ lotId: parentLotId, vesselId: null, deltaL: round2(lossL), reason: "loss" });
  assertBalanced(lines);

  return { lines, drawnL, fractionTotalL, lossL: round2(lossL) };
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
