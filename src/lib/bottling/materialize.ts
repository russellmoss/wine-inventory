import type { Prisma, SparklingMethod, DosageStyle } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";
import { findOrCreateWineSku } from "@/lib/bottling/sku";

// Phase 7 Unit 9 (K8): the SHARED finished-goods materialization core, extracted from the tail of
// `applyBottling` and parameterized on volume + bottle size so BOTH still-wine bottling and
// sparkling finalize hand off through ONE contract (one set of guarantees — no double-count /
// desync). It owns: the finished-good category, the WineSku (find-or-create on the partial
// indexes), the BottlingRun (the blessed generic finished-goods record, carrying sparkling batch
// facts), the per-source BottlingSource provenance rows, the RECEIVE StockMovement, and the
// BottledInventory upsert. The LEDGER op (BOTTLE for still, FINISH for sparkling) and the audit
// stay with the caller — they differ per path.

export type MaterializeSource = {
  lotId: string;
  vesselId?: string | null; // null for a finalized sparkling bottle lot (no vessel)
  varietyId?: string | null; // null for a blended / multi-vintage lot (K13)
  vineyardId?: string | null;
  vintage?: number | null;
  volumeConsumedL: number;
};

export type MaterializeInput = {
  categoryName?: string; // default "Wine"
  skuName: string;
  vintage: number | null; // null ⇒ NV
  isNonVintage: boolean;
  method?: SparklingMethod | null;
  dosageStyle?: DosageStyle | null;
  bottleSizeMl: number;
  bottlesProduced: number;
  volumeConsumedL: number;
  sources: MaterializeSource[];
  destinationLocationId: string;
  date: Date;
  actor: { actorUserId: string | null; actorEmail: string };
  // Sparkling batch facts on the BottlingRun (council CRITICAL #5 — NOT on the catalog SKU):
  disgorgedAt?: Date | null;
  dosageGramsPerL?: number | null;
};

export type MaterializeResult = { runId: string; skuId: string };

export async function materializeFinishedGoods(tx: Prisma.TransactionClient, input: MaterializeInput): Promise<MaterializeResult> {
  const categoryName = input.categoryName ?? "Wine";
  // Default the finished good to a category (upsert avoids a P2002 race on first bottling).
  const category = await tx.finishedGoodCategory.upsert({ where: { tenantId_name: { tenantId: requireTenantId(), name: categoryName } }, update: {}, create: { name: categoryName } });

  const sku = await findOrCreateWineSku(
    tx,
    { name: input.skuName, vintage: input.vintage, isNonVintage: input.isNonVintage, bottleSizeMl: input.bottleSizeMl },
    { categoryId: category.id, method: input.method ?? undefined, dosageStyle: input.dosageStyle ?? undefined },
  );

  const run = await tx.bottlingRun.create({
    data: {
      date: input.date,
      wineSkuId: sku.id,
      bottlesProduced: input.bottlesProduced,
      volumeConsumedL: input.volumeConsumedL,
      destinationLocationId: input.destinationLocationId,
      createdById: input.actor.actorUserId,
      createdByEmail: input.actor.actorEmail,
      disgorgedAt: input.disgorgedAt ?? null,
      dosageGramsPerL: input.dosageGramsPerL ?? null,
    },
  });

  for (const s of input.sources) {
    await tx.bottlingSource.create({
      data: {
        bottlingRunId: run.id,
        vesselId: s.vesselId ?? null,
        varietyId: s.varietyId ?? null,
        vineyardId: s.vineyardId ?? null,
        vintage: s.vintage ?? null,
        volumeConsumedL: s.volumeConsumedL,
        lotId: s.lotId,
      },
    });
  }

  await tx.stockMovement.create({
    data: {
      itemKind: "BOTTLED_WINE",
      wineSkuId: sku.id,
      locationId: input.destinationLocationId,
      kind: "RECEIVE",
      deltaUnits: input.bottlesProduced,
      bottlingRunId: run.id,
      createdById: input.actor.actorUserId,
      createdByEmail: input.actor.actorEmail,
      reason: "Bottling run",
    },
  });
  await tx.bottledInventory.upsert({
    where: { tenantId_wineSkuId_locationId: { tenantId: requireTenantId(), wineSkuId: sku.id, locationId: input.destinationLocationId } },
    update: { totalBottles: { increment: input.bottlesProduced } },
    create: { wineSkuId: sku.id, locationId: input.destinationLocationId, totalBottles: input.bottlesProduced },
  });

  return { runId: run.id, skuId: sku.id };
}
