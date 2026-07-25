-- Vineyard Intelligence P2 (NDVI core) — schema + RLS (copies the P1 planting_geometry structure).
-- Additive only: five NEW tables (spatial_scene, spatial_dataset, spatial_analysis_job, block_spatial_metric,
-- cdse_usage_counter) + ONE nullable-with-default column on vineyard (ndviAutoAdd). No NOT NULL backfill on
-- existing data, no data mutation. Enums landed in 20260725120000_ndvi_enums (committed first).
-- AGENTS.md 9-step tenant/RLS on all five tables: tenant FK, per-tenant uniques, (tenantId,id) composite FK
-- targets, composite lineage FKs (K11), fail-closed tenant_isolation RLS, app_rls grant. Cross-tenant-risk FKs
-- are RAW composite (tenantId, refId)→(tenantId, id). Hand-written; applied via `migrate deploy`.

-- ─────────────────────────────── 1) spatial_scene (immutable) ───────────────────────────────
CREATE TABLE "spatial_scene" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "providerSceneId" TEXT NOT NULL,
    "requestedDateTarget" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "bounds" JSONB NOT NULL,
    "sceneCloudCover" DECIMAL(6,3) NOT NULL,
    "processingBaseline" TEXT NOT NULL,
    "processingLevel" TEXT NOT NULL,
    "selectionReason" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spatial_scene_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spatial_scene_tenantId_vineyardId_providerSceneId_key" ON "spatial_scene"("tenantId", "vineyardId", "providerSceneId");
CREATE UNIQUE INDEX "spatial_scene_tenantId_id_key" ON "spatial_scene"("tenantId", "id");
CREATE INDEX "spatial_scene_tenantId_idx" ON "spatial_scene"("tenantId");
CREATE INDEX "spatial_scene_tenantId_vineyardId_idx" ON "spatial_scene"("tenantId", "vineyardId");
ALTER TABLE "spatial_scene" ADD CONSTRAINT "spatial_scene_tenantId_id_key" UNIQUE USING INDEX "spatial_scene_tenantId_id_key";
ALTER TABLE "spatial_scene" ADD CONSTRAINT "spatial_scene_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spatial_scene" ADD CONSTRAINT "spatial_scene_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 2) spatial_dataset (raster metadata) ───────────────────────────────
CREATE TABLE "spatial_dataset" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "datasetIdentity" TEXT NOT NULL,
    "kind" "SpatialDatasetKind" NOT NULL DEFAULT 'RASTER',
    "metric" "SpatialMetric" NOT NULL DEFAULT 'NDVI',
    "status" "SpatialDatasetStatus" NOT NULL DEFAULT 'INFLIGHT',
    "algorithmVersion" TEXT NOT NULL,
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
    "harmonizeValues" BOOLEAN NOT NULL DEFAULT false,
    "sclResampling" TEXT,
    "maskDilation" INTEGER NOT NULL DEFAULT 0,
    "processingUnits" DECIMAL(12,4),
    "processingBaseline" TEXT,
    "attribution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spatial_dataset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spatial_dataset_tenantId_datasetIdentity_key" ON "spatial_dataset"("tenantId", "datasetIdentity");
CREATE UNIQUE INDEX "spatial_dataset_tenantId_id_key" ON "spatial_dataset"("tenantId", "id");
CREATE INDEX "spatial_dataset_tenantId_idx" ON "spatial_dataset"("tenantId");
CREATE INDEX "spatial_dataset_tenantId_vineyardId_idx" ON "spatial_dataset"("tenantId", "vineyardId");
CREATE INDEX "spatial_dataset_tenantId_sceneId_idx" ON "spatial_dataset"("tenantId", "sceneId");
ALTER TABLE "spatial_dataset" ADD CONSTRAINT "spatial_dataset_tenantId_id_key" UNIQUE USING INDEX "spatial_dataset_tenantId_id_key";
ALTER TABLE "spatial_dataset" ADD CONSTRAINT "spatial_dataset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spatial_dataset" ADD CONSTRAINT "spatial_dataset_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spatial_dataset" ADD CONSTRAINT "spatial_dataset_scene_fkey" FOREIGN KEY ("tenantId", "sceneId") REFERENCES "spatial_scene"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 3) spatial_analysis_job (outbox) ───────────────────────────────
CREATE TABLE "spatial_analysis_job" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "kind" "SpatialJobKind" NOT NULL DEFAULT 'NDVI_SCENE',
    "status" "SpatialJobStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "sceneId" TEXT,
    "datasetId" TEXT,
    "params" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "withheldReason" TEXT,
    "faultClass" TEXT,
    "lastError" TEXT,
    "processingVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spatial_analysis_job_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spatial_analysis_job_tenantId_idempotencyKey_key" ON "spatial_analysis_job"("tenantId", "idempotencyKey");
CREATE INDEX "spatial_analysis_job_tenantId_idx" ON "spatial_analysis_job"("tenantId");
CREATE INDEX "spatial_analysis_job_tenantId_status_idx" ON "spatial_analysis_job"("tenantId", "status");
CREATE INDEX "spatial_analysis_job_tenantId_vineyardId_idx" ON "spatial_analysis_job"("tenantId", "vineyardId");
ALTER TABLE "spatial_analysis_job" ADD CONSTRAINT "spatial_analysis_job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spatial_analysis_job" ADD CONSTRAINT "spatial_analysis_job_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 4) block_spatial_metric (immutable snapshot) ───────────────────────────────
CREATE TABLE "block_spatial_metric" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "metric" "SpatialMetric" NOT NULL DEFAULT 'NDVI',
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "min" DECIMAL(8,5),
    "p10" DECIMAL(8,5),
    "p25" DECIMAL(8,5),
    "median" DECIMAL(8,5),
    "mean" DECIMAL(8,5),
    "p75" DECIMAL(8,5),
    "p90" DECIMAL(8,5),
    "max" DECIMAL(8,5),
    "stdDev" DECIMAL(8,5),
    "intersectingPixelCount" INTEGER NOT NULL,
    "validPixelCount" INTEGER NOT NULL,
    "effectivePixelCount" DECIMAL(14,4) NOT NULL,
    "validFraction" DECIMAL(7,6) NOT NULL,
    "coveredAreaM2" DECIMAL(16,2) NOT NULL,
    "mixedPixelShare" DECIMAL(7,6) NOT NULL,
    "qualityFlags" JSONB NOT NULL,
    "processingVersion" TEXT,
    "geometryVersion" INTEGER NOT NULL,
    "geometryFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "block_spatial_metric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bsm_tenant_block_dataset_metric_geomver_key" ON "block_spatial_metric"("tenantId", "blockId", "datasetId", "metric", "geometryVersion");
CREATE INDEX "block_spatial_metric_tenantId_idx" ON "block_spatial_metric"("tenantId");
CREATE INDEX "block_spatial_metric_tenantId_blockId_idx" ON "block_spatial_metric"("tenantId", "blockId");
CREATE INDEX "block_spatial_metric_tenantId_datasetId_idx" ON "block_spatial_metric"("tenantId", "datasetId");
CREATE INDEX "bsm_tenant_vineyard_metric_idx" ON "block_spatial_metric"("tenantId", "vineyardId", "metric");
ALTER TABLE "block_spatial_metric" ADD CONSTRAINT "block_spatial_metric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "block_spatial_metric" ADD CONSTRAINT "block_spatial_metric_block_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "block_spatial_metric" ADD CONSTRAINT "block_spatial_metric_dataset_fkey" FOREIGN KEY ("tenantId", "datasetId") REFERENCES "spatial_dataset"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 5) cdse_usage_counter (per-tenant/month quota telemetry) ───────────────────────────────
CREATE TABLE "cdse_usage_counter" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "yearMonth" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "processingUnits" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "blobEgressBytes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cdse_usage_counter_pkey" PRIMARY KEY ("tenantId", "yearMonth")
);
CREATE INDEX "cdse_usage_counter_tenantId_idx" ON "cdse_usage_counter"("tenantId");
ALTER TABLE "cdse_usage_counter" ADD CONSTRAINT "cdse_usage_counter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────── 6) vineyard: DARK auto-add flag (additive, default false) ───────────────────────────────
ALTER TABLE "vineyard" ADD COLUMN "ndviAutoAdd" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────── 7) RLS (Phase-12 pattern) on all five new tables ───────────────────────────────
ALTER TABLE "spatial_scene" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spatial_scene" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spatial_scene" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "spatial_dataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spatial_dataset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spatial_dataset" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "spatial_analysis_job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spatial_analysis_job" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spatial_analysis_job" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "block_spatial_metric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "block_spatial_metric" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "block_spatial_metric" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "cdse_usage_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cdse_usage_counter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cdse_usage_counter" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "spatial_scene" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "spatial_dataset" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "spatial_analysis_job" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "block_spatial_metric" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cdse_usage_counter" TO app_rls;

-- ─────────────────────────────── 8) Fail this migration if any new table lacks full RLS + policy ───────────────────────────────
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['spatial_scene', 'spatial_dataset', 'spatial_analysis_job', 'block_spatial_metric', 'cdse_usage_counter'] LOOP
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
