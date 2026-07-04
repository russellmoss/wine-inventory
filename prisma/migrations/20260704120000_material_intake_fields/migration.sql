-- Phase 036 Unit 3: richer material intake — a STORED main category + purchase/display metadata.
-- COLUMNS-ONLY on cellar_material (already tenant-scoped + RLS-FORCED), so the tenant_isolation policy
-- already covers every new column and app_rls's table-level DML grant extends to them (Phase-12 checklist:
-- RLS is per-table, not per-column). No enum, no index, no FK, no identity change
-- (@@unique([tenantId, kind, normalizedKey]) is unchanged). All new columns are organizational / display /
-- purchase-metadata; `category` is nullable with a categoryOf(kind) code fallback so legacy rows keep working.

ALTER TABLE "cellar_material" ADD COLUMN "category" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "genericName" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "brand" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "brandName" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "preferGeneric" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cellar_material" ADD COLUMN "vendor" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "vendorUrl" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "packageAmount" DECIMAL(18,6);
ALTER TABLE "cellar_material" ADD COLUMN "packageUnit" TEXT;

-- Backfill the stored category from the existing kind (mirror of categoryOf/KIND_TO_CATEGORY). Custom /
-- unknown kinds fall through to OTHER; code still falls back to categoryOf(kind) when category is NULL.
UPDATE "cellar_material" SET "category" = CASE
  WHEN "kind" IN ('YEAST','MLF','SO2','NUTRIENT','ACID','SUGAR','TANNIN','FINING','BENTONITE','CHITOSAN','ENZYME') THEN 'ADDITIVE'
  WHEN "kind" IN ('CLEANING','SANITIZER') THEN 'CLEANING_SANITIZING'
  WHEN "kind" = 'PACKAGING' THEN 'PACKAGING'
  ELSE 'OTHER'
END
WHERE "category" IS NULL;
