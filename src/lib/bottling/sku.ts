import type { Prisma, SparklingMethod, DosageStyle } from "@prisma/client";
import { isUniqueViolation } from "@/lib/lot/generate";

// Phase 7 (K11): WineSku identity lookup that honors the TWO partial unique indexes that
// replaced the old compound @@unique — vintaged SKUs dedupe on (name, vintage, bottleSizeMl)
// WHERE vintage IS NOT NULL; NV SKUs on (name, bottleSizeMl) WHERE isNonVintage. Postgres
// treats NULLs as distinct, so a nullable `vintage` can't ride a normal compound key and
// Prisma can't `upsert`/`findUnique` on it — every lookup goes through find-or-create here.
// PrismaClient is structurally assignable to TransactionClient, so both callers work.

export type WineSkuKey = {
  name: string;
  vintage: number | null;
  isNonVintage: boolean;
  bottleSizeMl: number;
};

/** Find a WineSku by its logical identity (mirrors the partial unique indexes). */
export function findWineSku(
  db: Prisma.TransactionClient,
  key: WineSkuKey,
): Promise<{ id: string } | null> {
  if (key.isNonVintage) {
    return db.wineSku.findFirst({
      where: { name: key.name, bottleSizeMl: key.bottleSizeMl, isNonVintage: true },
      select: { id: true },
    });
  }
  return db.wineSku.findFirst({
    where: { name: key.name, vintage: key.vintage, bottleSizeMl: key.bottleSizeMl },
    select: { id: true },
  });
}

export type WineSkuCreateExtra = {
  categoryId?: string | null;
  method?: SparklingMethod | null;
  dosageStyle?: DosageStyle | null;
};

/**
 * Find-or-create a WineSku by logical identity. Replaces the compound `upsert` (which can't
 * target a partial index). Catches the P2002 that a concurrent create would raise on the
 * partial unique index and re-reads, so it stays race-safe like the old upsert.
 */
export async function findOrCreateWineSku(
  tx: Prisma.TransactionClient,
  key: WineSkuKey,
  extra: WineSkuCreateExtra = {},
): Promise<{ id: string; created: boolean }> {
  const existing = await findWineSku(tx, key);
  if (existing) return { id: existing.id, created: false };
  try {
    const sku = await tx.wineSku.create({
      data: {
        name: key.name,
        vintage: key.vintage,
        isNonVintage: key.isNonVintage,
        bottleSizeMl: key.bottleSizeMl,
        categoryId: extra.categoryId ?? undefined,
        method: extra.method ?? undefined,
        dosageStyle: extra.dosageStyle ?? undefined,
      },
      select: { id: true },
    });
    return { id: sku.id, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await findWineSku(tx, key);
      if (again) return { id: again.id, created: false };
    }
    throw e;
  }
}
