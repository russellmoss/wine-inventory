import { round2 } from "@/lib/bottling/draw";
import { assertBalanced, balanceKey, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";

// Phase 7 Unit 3: PURE ledger-line planners for the sparkling arc. No DB, no server imports —
// unit-tested directly, mirroring planBlend / planVesselLoss. Every bottle-storage leg is
// tagged bucket="BOTTLE_STORAGE" and pairs a signed `deltaL` (liters) with a signed
// `bottleDelta` (count); the chokepoint (Unit 4) folds volumeL from deltaL and bottleCount from
// bottleDelta. All liter math goes through round2 (centiliters) so sums stay exact (D14).

const EPS = 1e-9;

/** mL → L, centiliter-rounded (exact ledger math). */
export function mlToL(ml: number): number {
  return round2(ml / 1000);
}

// ───────────────────────── Tirage: bulk → en-tirage bottle lot ─────────────────────────

export type TirageBottlingPlan = {
  lines: LedgerLine[];
  drawL: number;
  bottleCount: number;
  nominalFillMl: number;
};

/**
 * Bottle `bottleCount × nominalFillMl` of a bulk lot out of `vesselId` into an en-tirage bottle
 * lot (same lotId — the lot transitions WINE → BOTTLED_IN_PROCESS). One `−drawL` VESSEL leg + one
 * `+drawL` BOTTLE_STORAGE leg carrying `bottleDelta = +bottleCount`. `drawL` is the actual bulk
 * volume moved (the wine now in glass); it need not equal count × fill exactly (the K6 tolerance
 * band covers ullage/foam). Validated against the lot's live balance in that vessel.
 */
export function planTirageBottling(
  sourceBalances: VesselLotBalance[],
  vesselId: string,
  lotId: string,
  drawL: number,
  bottleCount: number,
  nominalFillMl: number,
): TirageBottlingPlan {
  if (!(drawL > 0)) throw new Error("Tirage draw volume must be greater than 0.");
  if (!(bottleCount > 0) || !Number.isInteger(bottleCount)) throw new Error("Bottle count must be a positive whole number.");
  if (!(nominalFillMl > 0)) throw new Error("Bottle fill (mL) must be greater than 0.");
  const have = sourceBalances.find((b) => balanceKey(b.vesselId, b.lotId) === balanceKey(vesselId, lotId))?.volumeL ?? 0;
  const draw = round2(drawL);
  if (draw > round2(have) + EPS) {
    throw new Error(`Can't bottle ${draw} L — that lot holds ${round2(have)} L in that vessel.`);
  }
  const lines: LedgerLine[] = [
    { lotId, vesselId, deltaL: -draw, bucket: "VESSEL" },
    { lotId, vesselId: null, deltaL: draw, bucket: "BOTTLE_STORAGE", bottleDelta: bottleCount },
  ];
  assertBalanced(lines);
  return { lines, drawL: draw, bottleCount, nominalFillMl };
}

// ───────────────────────── Disgorgement: per-bottle volume LOSS ─────────────────────────

export type DisgorgementInput = {
  lotId: string;
  bottlesDisgorged: number; // bottles whose lees plug is ejected (each loses perBottleLossMl)
  perBottleLossMl: number; // typical ~20–37 mL / 750 mL
  perBottleVolumeMl: number; // current per-bottle fill — used to value broken-bottle wine
  sacrificedBottleCount?: number; // opened to top survivors → wine reallocated (count down, no extra volume loss)
  breakageCount?: number; // broken/culled → count down AND their wine lost
};

export type DisgorgementPlan = {
  lines: LedgerLine[];
  volumeLostL: number;
  bottleDelta: number; // −(sacrificed + breakage)
};

/**
 * Eject the lees plug as a per-bottle LOSS. Volume lost = plug loss over the disgorged bottles
 * + the wine in broken bottles. Sacrificial bottles are reallocated into survivors (count drops,
 * volume does NOT — council). Breakage drops both count and volume (else count↔volume drifts out
 * of the K6 band). Balanced LOSS: `−` out of BOTTLE_STORAGE, `+` to EXTERNAL (reason "loss").
 */
export function planDisgorgement(input: DisgorgementInput): DisgorgementPlan {
  const { lotId, bottlesDisgorged, perBottleLossMl, perBottleVolumeMl } = input;
  const sacrificed = input.sacrificedBottleCount ?? 0;
  const breakage = input.breakageCount ?? 0;
  if (!(bottlesDisgorged > 0) || !Number.isInteger(bottlesDisgorged)) throw new Error("Bottles disgorged must be a positive whole number.");
  if (!(perBottleLossMl > 0)) throw new Error("Per-bottle disgorgement loss (mL) must be greater than 0.");
  if (!(perBottleVolumeMl > 0)) throw new Error("Per-bottle fill (mL) must be greater than 0.");
  if (sacrificed < 0 || breakage < 0 || !Number.isInteger(sacrificed) || !Number.isInteger(breakage)) throw new Error("Sacrificial / breakage counts must be non-negative whole numbers.");

  const volumeLostL = round2((perBottleLossMl * bottlesDisgorged + perBottleVolumeMl * breakage) / 1000);
  const removedBottles = sacrificed + breakage;
  const bottleDelta = removedBottles === 0 ? 0 : -removedBottles; // avoid -0

  const lines: LedgerLine[] = [
    { lotId, vesselId: null, deltaL: -volumeLostL, bucket: "BOTTLE_STORAGE", bottleDelta },
    { lotId, vesselId: null, deltaL: volumeLostL, bucket: "EXTERNAL", reason: "loss" },
  ];
  assertBalanced(lines);
  return { lines, volumeLostL, bottleDelta };
}

// ───────────────────────── Dosage: liqueur d'expédition (+volume) ─────────────────────────

export type DosagePlan = { lines: LedgerLine[]; addedL: number };

/**
 * Add `perBottleDoseMl × bottlesDosed` of liqueur back into the bottle lot. `+` into
 * BOTTLE_STORAGE (bottleDelta 0 — count unchanged) balanced against an EXTERNAL source leg
 * (reason "dosage" — NOT counted as loss).
 */
export function planDosage(lotId: string, bottlesDosed: number, perBottleDoseMl: number): DosagePlan {
  if (!(bottlesDosed > 0) || !Number.isInteger(bottlesDosed)) throw new Error("Bottles dosed must be a positive whole number.");
  if (!(perBottleDoseMl > 0)) throw new Error("Per-bottle dose (mL) must be greater than 0.");
  const addedL = round2((perBottleDoseMl * bottlesDosed) / 1000);
  const lines: LedgerLine[] = [
    { lotId, vesselId: null, deltaL: addedL, bucket: "BOTTLE_STORAGE", bottleDelta: 0 },
    { lotId, vesselId: null, deltaL: -addedL, bucket: "EXTERNAL", reason: "dosage" },
  ];
  assertBalanced(lines);
  return { lines, addedL };
}

// ───────────────────────── Partial disgorgement: split off a child bottle lot ─────────────────────────

export type BottleLotState = { lotId: string; bottleCount: number; volumeL: number };
export type BottleSplitTranche = { childLotId: string; bottleCount: number };

export type BottleSplitPlan = {
  lines: LedgerLine[];
  perTranche: { childLotId: string; bottleCount: number; volumeL: number }[];
  parentRemainingCount: number;
  parentRemainingVolumeL: number;
};

/**
 * Peel one or more child bottle lots off a parent en-tirage lot (partial disgorgement = a SPLIT,
 * K4). Each tranche takes `bottleCount` bottles and their proportional volume (parent per-bottle
 * fill). Parent gets a single `−` BOTTLE_STORAGE leg; each child a `+` leg. Count and volume are
 * conserved. Throws if the tranches exceed the parent's bottles.
 */
export function planBottleSplit(state: BottleLotState, tranches: BottleSplitTranche[]): BottleSplitPlan {
  if (tranches.length === 0) throw new Error("A split needs at least one tranche.");
  if (!(state.bottleCount > 0)) throw new Error("Parent bottle lot is empty.");
  const perBottleFill = state.volumeL / state.bottleCount;

  let takenCount = 0;
  let takenVolume = 0;
  const perTranche: BottleSplitPlan["perTranche"] = [];
  const childLines: LedgerLine[] = [];
  for (const t of tranches) {
    if (!(t.bottleCount > 0) || !Number.isInteger(t.bottleCount)) throw new Error("Each tranche must peel a positive whole number of bottles.");
    const vol = round2(perBottleFill * t.bottleCount);
    takenCount += t.bottleCount;
    takenVolume = round2(takenVolume + vol);
    perTranche.push({ childLotId: t.childLotId, bottleCount: t.bottleCount, volumeL: vol });
    childLines.push({ lotId: t.childLotId, vesselId: null, deltaL: vol, bucket: "BOTTLE_STORAGE", bottleDelta: t.bottleCount });
  }
  if (takenCount > state.bottleCount) throw new Error(`Can't peel ${takenCount} bottles — the lot holds ${state.bottleCount}.`);
  if (takenVolume > round2(state.volumeL) + EPS) throw new Error(`Split volume ${takenVolume} L exceeds the lot's ${round2(state.volumeL)} L.`);

  const lines: LedgerLine[] = [
    { lotId: state.lotId, vesselId: null, deltaL: -takenVolume, bucket: "BOTTLE_STORAGE", bottleDelta: -takenCount },
    ...childLines,
  ];
  assertBalanced(lines);
  return {
    lines,
    perTranche,
    parentRemainingCount: state.bottleCount - takenCount,
    parentRemainingVolumeL: round2(state.volumeL - takenVolume),
  };
}

// ───────────────────────── Finish: close the bottle lot into finished goods ─────────────────────────

export type FinishHandoffPlan = { lines: LedgerLine[]; volumeL: number; bottleCount: number };

/**
 * Close out a fully-disgorged/dosed bottle lot: `−volumeL` / `bottleDelta = −bottleCount` out of
 * BOTTLE_STORAGE (both hit functional zero → the projection row is deleted), balanced against an
 * EXTERNAL leg (reason "bottle" — the wine leaves into packaged goods). The finished WineSku /
 * BottlingRun / inventory are created by the shared materialization core (Unit 9), not here.
 */
export function planFinishHandoff(state: BottleLotState): FinishHandoffPlan {
  if (!(state.bottleCount > 0)) throw new Error("Nothing to finish — the bottle lot is empty.");
  if (!(state.volumeL > 0)) throw new Error("Nothing to finish — the bottle lot holds no volume.");
  const volumeL = round2(state.volumeL);
  const lines: LedgerLine[] = [
    { lotId: state.lotId, vesselId: null, deltaL: -volumeL, bucket: "BOTTLE_STORAGE", bottleDelta: -state.bottleCount },
    { lotId: state.lotId, vesselId: null, deltaL: volumeL, bucket: "EXTERNAL", reason: "bottle" },
  ];
  assertBalanced(lines);
  return { lines, volumeL, bottleCount: state.bottleCount };
}
