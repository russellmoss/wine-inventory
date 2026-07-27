-- Vineyard Intelligence P1 (planting geometry foundation).
-- Additive only: two NEW tables (vineyard_planting_area, vineyard_geometry_version), three NEW enums,
-- and NULLABLE columns on vineyard / vineyard_block. No NOT NULL, no backfill, no data mutation.
-- AGENTS.md 9-step tenant/RLS on both new tables (tenant FK, per-tenant uniques, (tenantId,id) composite
-- FK target, fail-closed tenant_isolation RLS, app_rls grant). block.plantingAreaId is a composite FK (K11).
-- Hand-written (prisma migrate diff emits a phantom full-resync on this DB); applied via `migrate deploy`.

-- 1) Enums. Brand-new CREATE TYPE is safe inside the migration tx (unlike ALTER TYPE ADD VALUE).
CREATE TYPE "PlantingAreaSource" AS ENUM ('DRAW', 'IMPORT', 'DERIVED');
CREATE TYPE "PlantingReviewStatus" AS ENUM ('PROPOSED', 'CONFIRMED');
CREATE TYPE "GeometrySubjectType" AS ENUM ('PLANTING_AREA', 'BLOCK');

-- 2) vineyard_planting_area
CREATE TABLE "vineyard_planting_area" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "geometry" JSONB NOT NULL,
    "geometryVersion" INTEGER NOT NULL DEFAULT 1,
    "geometryFingerprint" TEXT NOT NULL,
    "canonicalAnchor" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "PlantingAreaSource" NOT NULL,
    "excludedHoleNote" TEXT,
    "reviewStatus" "PlantingReviewStatus" NOT NULL DEFAULT 'PROPOSED',
    "areaProjectedM2" DECIMAL(14,2),
    "areaGeodesicM2" DECIMAL(14,2),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vineyard_planting_area_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vineyard_planting_area_tenantId_vineyardId_name_key" ON "vineyard_planting_area"("tenantId", "vineyardId", "name");
CREATE UNIQUE INDEX "vineyard_planting_area_tenantId_id_key" ON "vineyard_planting_area"("tenantId", "id");
CREATE INDEX "vineyard_planting_area_tenantId_idx" ON "vineyard_planting_area"("tenantId");
CREATE INDEX "vineyard_planting_area_tenantId_vineyardId_idx" ON "vineyard_planting_area"("tenantId", "vineyardId");
ALTER TABLE "vineyard_planting_area" ADD CONSTRAINT "vineyard_planting_area_tenantId_id_key" UNIQUE USING INDEX "vineyard_planting_area_tenantId_id_key";
ALTER TABLE "vineyard_planting_area" ADD CONSTRAINT "vineyard_planting_area_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vineyard_planting_area" ADD CONSTRAINT "vineyard_planting_area_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) vineyard_geometry_version (append-only history; one OPEN row per subject)
CREATE TABLE "vineyard_geometry_version" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "subjectType" "GeometrySubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "canonicalAnchor" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "iouFromPrev" DECIMAL(6,5),
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vineyard_geometry_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vgv_tenant_subject_version_key" ON "vineyard_geometry_version"("tenantId", "subjectType", "subjectId", "version");
CREATE INDEX "vgv_tenant_subject_idx" ON "vineyard_geometry_version"("tenantId", "subjectType", "subjectId");
CREATE INDEX "vineyard_geometry_version_tenantId_idx" ON "vineyard_geometry_version"("tenantId");
-- Exactly one OPEN (effectiveTo IS NULL) version per subject (council C3/S2).
CREATE UNIQUE INDEX "vgv_one_open_per_subject_key" ON "vineyard_geometry_version"("tenantId", "subjectType", "subjectId") WHERE "effectiveTo" IS NULL;
ALTER TABLE "vineyard_geometry_version" ADD CONSTRAINT "vineyard_geometry_version_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) vineyard: all-or-nothing migration gate.
ALTER TABLE "vineyard" ADD COLUMN "plantingMigratedAt" TIMESTAMP(3);

-- 5) vineyard_block: parent ref (composite FK, K11) + geometry-version columns.
ALTER TABLE "vineyard_block" ADD COLUMN "plantingAreaId" TEXT;
ALTER TABLE "vineyard_block" ADD COLUMN "geometryVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vineyard_block" ADD COLUMN "geometryFingerprint" TEXT;
CREATE INDEX "vineyard_block_tenantId_plantingAreaId_idx" ON "vineyard_block"("tenantId", "plantingAreaId");
ALTER TABLE "vineyard_block" ADD CONSTRAINT "vineyard_block_plantingArea_fkey" FOREIGN KEY ("tenantId", "plantingAreaId") REFERENCES "vineyard_planting_area"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) RLS (Phase-12 pattern) on both new tables.
ALTER TABLE "vineyard_planting_area" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_planting_area" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_planting_area" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vineyard_geometry_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_geometry_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_geometry_version" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_planting_area" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_geometry_version" TO app_rls;

-- 7) Fail this migration if either new table lacks full RLS + policy.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['vineyard_planting_area', 'vineyard_geometry_version'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', r;
    END IF;
  END LOOP;
END
$$;
