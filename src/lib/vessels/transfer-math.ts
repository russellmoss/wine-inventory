import { computeProportionalDraw, round2 } from "@/lib/bottling/draw";

// Pure planning for a vessel-to-vessel transfer (racking). No server imports, so
// it's unit-tested directly. Reuses the centiliter/largest-remainder draw math so
// all volumes sum exactly (no floating-point drift).

export type SourceComponent = {
  id: string;
  varietyId: string;
  vineyardId: string;
  vintage: number;
  volumeL: number;
};

export type TransferPlan = {
  drawL: number; // removed from the source
  lossL: number; // lost to lees (stays behind / discarded)
  addedL: number; // into the destination = drawL - lossL
  deductions: { id: string; deduct: number; remaining: number }[];
  additions: { varietyId: string; vineyardId: string; vintage: number; volumeL: number }[];
};

/**
 * Plan a rack of `drawL` liters out of `source`, losing `lossL` to lees. The moved
 * wine keeps its lot breakdown (variety/vineyard/vintage); loss is removed
 * proportionally from that breakdown. Guarantees:
 *   sum(deductions.deduct) === drawL, and sum(additions.volumeL) === drawL - lossL.
 * Throws if drawL <= 0, loss is negative or exceeds the draw, or draw exceeds the
 * source total (the latter surfaces from computeProportionalDraw).
 */
export function planTransfer(source: SourceComponent[], drawL: number, lossL = 0): TransferPlan {
  if (!(drawL > 0)) throw new Error("Transfer volume must be greater than 0.");
  if (lossL < 0) throw new Error("Loss can't be negative.");
  if (lossL > drawL) throw new Error("Loss can't exceed the transfer volume.");

  // 1. Remove drawL proportionally from the source components.
  const deductions = computeProportionalDraw(
    source.map((c) => ({ id: c.id, volumeL: c.volumeL })),
    drawL,
  );
  const movedById = new Map(deductions.map((d) => [d.id, d.deduct]));

  // 2. Remove loss proportionally from the moved breakdown.
  const lossPortions =
    lossL > 0
      ? computeProportionalDraw(
          deductions.filter((d) => d.deduct > 0).map((d) => ({ id: d.id, volumeL: d.deduct })),
          lossL,
        )
      : [];
  const lossById = new Map(lossPortions.map((l) => [l.id, l.deduct]));

  // 3. Additions carry the source lot identity; volume = moved - loss; keep >0.
  const additions = source
    .map((c) => {
      const moved = movedById.get(c.id) ?? 0;
      const lost = lossById.get(c.id) ?? 0;
      return {
        varietyId: c.varietyId,
        vineyardId: c.vineyardId,
        vintage: c.vintage,
        volumeL: round2(moved - lost),
      };
    })
    .filter((a) => a.volumeL > 0);

  return {
    drawL: round2(drawL),
    lossL: round2(lossL),
    addedL: round2(drawL - lossL),
    deductions,
    additions,
  };
}

const EPS = 1e-9;

export type SnapshotLot = { varietyId: string; vineyardId: string; vintage: number; volumeL: number };
export type DestComponent = SourceComponent; // { id, varietyId, vineyardId, vintage, volumeL }

export type RevertPlan = {
  ok: boolean;
  totalL: number;
  shortfalls: { varietyId: string; vineyardId: string; vintage: number; need: number; have: number }[];
  deductions: { id: string; deduct: number; remaining: number }[]; // from the destination
  additions: { varietyId: string; vineyardId: string; vintage: number; volumeL: number }[]; // back to the source
};

const lotKey = (l: { varietyId: string; vineyardId: string; vintage: number }) =>
  `${l.varietyId}|${l.vineyardId}|${l.vintage}`;

/**
 * Plan undoing a rack: move the recorded `snapshotLots` back out of the
 * destination's current components. Volumes are explicit (no proportional split).
 * Returns ok:false with named shortfalls if the destination no longer holds enough
 * of a lot (bottled / blended / racked onward since). Caller still capacity-checks
 * the source.
 */
export function planRevert(snapshotLots: SnapshotLot[], destComponents: DestComponent[]): RevertPlan {
  // Aggregate snapshot by lot (defensive — additions are already unique).
  const need = new Map<string, SnapshotLot>();
  for (const l of snapshotLots) {
    const k = lotKey(l);
    const prev = need.get(k);
    if (prev) prev.volumeL = round2(prev.volumeL + l.volumeL);
    else need.set(k, { ...l });
  }
  const destByKey = new Map(destComponents.map((c) => [lotKey(c), c]));

  const shortfalls: RevertPlan["shortfalls"] = [];
  const deductions: RevertPlan["deductions"] = [];
  const additions: RevertPlan["additions"] = [];
  let totalL = 0;

  for (const lot of need.values()) {
    const dest = destByKey.get(lotKey(lot));
    const have = dest ? dest.volumeL : 0;
    if (!dest || have < lot.volumeL - EPS) {
      shortfalls.push({ varietyId: lot.varietyId, vineyardId: lot.vineyardId, vintage: lot.vintage, need: lot.volumeL, have });
      continue;
    }
    deductions.push({ id: dest.id, deduct: lot.volumeL, remaining: round2(have - lot.volumeL) });
    additions.push({ varietyId: lot.varietyId, vineyardId: lot.vineyardId, vintage: lot.vintage, volumeL: lot.volumeL });
    totalL = round2(totalL + lot.volumeL);
  }

  return { ok: shortfalls.length === 0, totalL, shortfalls, deductions, additions };
}
