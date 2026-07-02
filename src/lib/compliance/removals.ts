import { prisma } from "@/lib/prisma";
import { litersToGallonsExact } from "./gallons";
import { deriveTaxClass } from "./tax-class";
import { resolveClassesForLots } from "./generate";
import type { SparklingMethodLike, WineTaxClass } from "./types";

// plan-026 Unit 5 (eng E2/E3) — the ONE shared "net taxpaid gallons by tax class in a window" helper.
// Three callers lean on it with no duplication: the excise period compute (Unit 5), the STATELESS YTD
// recompute (Jan 1 → period start, council C3 — just a wider window, E3), and the verify/anomaly views.
//
// Council C5 — the excise tax base is ONLY taxpaid removals. This filters bulk EXTERNAL legs with
// reason `tax_removal` AND disposition `TAXPAID` (EXPORT/FAMILY_USE/TASTING/TESTING/DISTILLING/VINEGAR
// are tax-EXEMPT and excluded) plus bottled StockMovements with reason `TAXPAID`. Reversals net to zero
// (a CORRECTION's inverse leg carries −liters and the same reason; a compensating bottled movement
// carries +units). deltaL on a `tax_removal` external leg is POSITIVE (gallons that left) — see
// planVesselLoss; the correction's inverse is negative, so a signed sum nets.

const num = (d: unknown) => Number(d as number);

export type RemovedByClass = Partial<Record<WineTaxClass, number>>; // exact gallons per class

export type RemovedTaxpaid = {
  /** Net taxpaid gallons removed in the window, per tax class (exact — round only at the tax cell). */
  gallonsByClass: RemovedByClass;
  /** Total net taxpaid gallons across all classes. */
  totalGallons: number;
  /** Per-lot classification of the bulk lots that had a taxpaid removal (for anomaly ABV>24 checks). */
  perLot: import("./generate").PerLotClass[];
};

/**
 * Net taxpaid gallons removed by tax class in [start, end]. `overrides` mirrors the generate path so a
 * lot's manual tax-class override applies identically here. `tenantId` is explicit (K12).
 */
export async function removedTaxpaidGallonsByClass(
  tenantId: string,
  range: { start: Date; end: Date },
  overrides: Record<string, WineTaxClass> = {},
): Promise<RemovedTaxpaid> {
  // ── 1. BULK taxpaid removals (+ their corrections) in the window ──
  const lines = await prisma.lotOperationLine.findMany({
    where: {
      bucket: "EXTERNAL",
      reason: "tax_removal",
      operation: { observedAt: { gte: range.start, lte: range.end } },
    },
    select: {
      lotId: true,
      deltaL: true,
      operation: { select: { id: true, type: true, correctsOperationId: true, metadata: true } },
    },
  });

  // A CORRECTION leg's OWN op metadata has no disposition — resolve it from the op it corrects (C5).
  const baseIds = [
    ...new Set(
      lines
        .filter((l) => l.operation.type === "CORRECTION" && l.operation.correctsOperationId)
        .map((l) => l.operation.correctsOperationId as number),
    ),
  ];
  const baseOps = baseIds.length
    ? await prisma.lotOperation.findMany({ where: { id: { in: baseIds } }, select: { id: true, metadata: true } })
    : [];
  const baseMeta = new Map(baseOps.map((o) => [o.id, (o.metadata ?? {}) as { disposition?: string }]));

  const litersByLot = new Map<string, number>();
  for (const l of lines) {
    const op = l.operation;
    const meta = (op.type === "CORRECTION" && op.correctsOperationId
      ? baseMeta.get(op.correctsOperationId)
      : (op.metadata as { disposition?: string } | null)) ?? {};
    if ((meta.disposition ?? "") !== "TAXPAID") continue; // C5: taxpaid only
    litersByLot.set(l.lotId, (litersByLot.get(l.lotId) ?? 0) + num(l.deltaL));
  }

  const bulkLotIds = [...litersByLot.keys()];
  const classes = await resolveClassesForLots(bulkLotIds, range.end, overrides);

  const gallonsByClass: RemovedByClass = {};
  const add = (c: WineTaxClass, gal: number) => {
    if (gal === 0) return;
    gallonsByClass[c] = (gallonsByClass[c] ?? 0) + gal;
  };
  for (const [lotId, liters] of litersByLot) {
    if (Math.abs(liters) < 1e-9) continue; // reversal netted to zero
    const c = classes.get(lotId);
    if (!c) continue;
    add(c.taxClass, litersToGallonsExact(liters));
  }

  // ── 2. BOTTLED taxpaid removals (finished-goods StockMovements, reason TAXPAID) ──
  const [runs, movements] = await Promise.all([
    prisma.bottlingRun.findMany({
      orderBy: { date: "asc" },
      select: { wineSkuId: true, bottledAbv: true, wineSku: { select: { bottleSizeMl: true, method: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { itemKind: "BOTTLED_WINE", createdAt: { gte: range.start, lte: range.end } },
      select: { wineSkuId: true, deltaUnits: true, reason: true },
    }),
  ]);
  const skuInfo = new Map<string, { abv: number | null; method: SparklingMethodLike | null; sizeMl: number }>();
  for (const r of runs) if (r.wineSkuId) skuInfo.set(r.wineSkuId, { abv: r.bottledAbv == null ? null : num(r.bottledAbv), method: (r.wineSku.method as SparklingMethodLike) ?? null, sizeMl: r.wineSku.bottleSizeMl });

  // Net removed bottles per sku (a −N removal + a +N reversal net to 0).
  const removedBottlesBySku = new Map<string, number>();
  for (const m of movements) {
    if (!m.wineSkuId) continue;
    if ((m.reason ?? "").toUpperCase() !== "TAXPAID") continue;
    removedBottlesBySku.set(m.wineSkuId, (removedBottlesBySku.get(m.wineSkuId) ?? 0) - m.deltaUnits); // −delta → removals count positive
  }
  for (const [skuId, bottles] of removedBottlesBySku) {
    if (bottles === 0) continue;
    const info = skuInfo.get(skuId);
    if (!info) continue;
    const liters = bottles * (info.sizeMl / 1000);
    const cls = deriveTaxClass({ abv: info.abv, productType: "WINE", carbonation: "NONE", sparklingMethod: info.method });
    add(cls.taxClass, litersToGallonsExact(liters));
  }

  const totalGallons = Object.values(gallonsByClass).reduce((a, v) => a + (v ?? 0), 0);
  return { gallonsByClass, totalGallons, perLot: [...classes.values()] };
}
