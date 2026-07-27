-- Vineyard Intelligence P3 (NDVI display) — schema + RLS (copies the P2 spatial structure exactly).
-- Additive only: two NEW tables (spatial_dataset_derivative, spatial_style). No NOT NULL backfill on existing data,
-- no data mutation. Enums landed in 20260725130000_ndvi_display_enums (committed first).
-- AGENTS.md 9-step tenant/RLS on both tables: tenant FK, (tenantId, refId)→(tenantId, id) composite lineage FKs (K11),
-- fail-closed tenant_isolation RLS, app_rls grant. council fix #2 = spatial_style uses TWO partial unique indexes +
-- a scope↔vineyardId CHECK (a plain composite unique would NOT dedupe SYSTEM rows — Postgres treats NULL as distinct).
-- Hand-written; applied via `migrate deploy` (the Windows migrate-diff→deploy rule, never `migrate dev`).

-- ─────────────────────────────── 1) spatial_dataset_derivative (cached warped/quantized display raster) ───────────────────────────────
CREATE TABLE "spatial_dataset_derivative" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "kind" "SpatialDerivativeKind" NOT NULL DEFAULT 'DISPLAY_NDVI',
    "recipeVersion" INTEGER NOT NULL,
    "status" "SpatialDatasetStatus" NOT NULL DEFAULT 'INFLIGHT',
    "blobUrl" TEXT,
    "blobKey" TEXT,
    "blobSha256" TEXT,
    "byteSize" INTEGER,
    "crsEpsg" INTEGER,
    "originX" DECIMAL(14,4),
    "originY" DECIMAL(14,4),
    "pixelSizeM" DECIMAL(10,4),
    "gridWidth" INTEGER,
    "gridHeight" INTEGER,
    "axisYSign" INTEGER,
    "wgs84Bbox" JSONB,
    "quantScale" INTEGER NOT NULL DEFAULT 10000,
    "noDataSentinel" INTEGER NOT NULL DEFAULT -32768,
    "recipeHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spatial_dataset_derivative_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sdd_tenant_dataset_kind_recipe_key" ON "spatial_dataset_derivative"("tenantId", "datasetId", "kind", "recipeVersion");
CREATE INDEX "spatial_dataset_derivative_tenantId_idx" ON "spatial_dataset_derivative"("tenantId");
CREATE INDEX "spatial_dataset_derivative_tenantId_datasetId_idx" ON "spatial_dataset_derivative"("tenantId", "datasetId");
CREATE INDEX "spatial_dataset_derivative_tenantId_vineyardId_idx" ON "spatial_dataset_derivative"("tenantId", "vineyardId");
ALTER TABLE "spatial_dataset_derivative" ADD CONSTRAINT "spatial_dataset_derivative_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spatial_dataset_derivative" ADD CONSTRAINT "spatial_dataset_derivative_dataset_fkey" FOREIGN KEY ("tenantId", "datasetId") REFERENCES "spatial_dataset"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 2) spatial_style (saved palette/domain presets) ───────────────────────────────
CREATE TABLE "spatial_style" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "scope" "SpatialStyleScope" NOT NULL DEFAULT 'SYSTEM',
    "vineyardId" TEXT,
    "metric" "SpatialMetric" NOT NULL DEFAULT 'NDVI',
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "paletteId" TEXT NOT NULL,
    "reverse" BOOLEAN NOT NULL DEFAULT false,
    "customStops" JSONB,
    "percentileLow" DECIMAL(4,3),
    "percentileHigh" DECIMAL(4,3),
    "fixedMin" DECIMAL(6,4),
    "fixedMax" DECIMAL(6,4),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spatial_style_pkey" PRIMARY KEY ("id"),
    -- council fix #2: the scope↔vineyardId invariant, enforced fail-closed at the DB.
    CONSTRAINT "spatial_style_scope_vineyard_chk" CHECK (("scope" = 'VINEYARD') = ("vineyardId" IS NOT NULL))
);
-- council fix #2: TWO partial unique indexes — a plain composite unique would let duplicate SYSTEM rows in
-- (Postgres treats every NULL vineyardId as distinct, so it never dedupes them).
CREATE UNIQUE INDEX "spatial_style_system_key" ON "spatial_style"("tenantId", "scope", "metric", "name") WHERE "vineyardId" IS NULL;
CREATE UNIQUE INDEX "spatial_style_vineyard_key" ON "spatial_style"("tenantId", "vineyardId", "metric", "name") WHERE "vineyardId" IS NOT NULL;
CREATE INDEX "spatial_style_tenantId_idx" ON "spatial_style"("tenantId");
CREATE INDEX "spatial_style_tenantId_scope_idx" ON "spatial_style"("tenantId", "scope");
CREATE INDEX "spatial_style_tenantId_vineyardId_idx" ON "spatial_style"("tenantId", "vineyardId");
ALTER TABLE "spatial_style" ADD CONSTRAINT "spatial_style_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spatial_style" ADD CONSTRAINT "spatial_style_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 3) RLS (Phase-12 pattern) on both new tables ───────────────────────────────
ALTER TABLE "spatial_dataset_derivative" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spatial_dataset_derivative" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spatial_dataset_derivative" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "spatial_style" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spatial_style" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spatial_style" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "spatial_dataset_derivative" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "spatial_style" TO app_rls;

-- ─────────────────────────────── 4) Fail this migration if either new table lacks full RLS + policy ───────────────────────────────
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['spatial_dataset_derivative', 'spatial_style'] LOOP
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
