-- Vineyard Intelligence P4 (soil documentation) — schema + RLS (copies the P2 ndvi_schema structure).
-- Additive only: ONE new table (block_soil_snapshot). No data mutation, no NOT NULL backfill, no enum change
-- (coverageState is a String union — the Windows enum-ordering trap, and dodges an ALTER TYPE serialization
-- vs the parallel P8 lane). AGENTS.md 9-step tenant/RLS: tenant FK, denormalized vineyardId (no FK, mirrors
-- block_spatial_metric), composite (tenantId, blockId)→vineyard_block(tenantId, id) FK (K11 raw, no @relation),
-- partial-unique one-current-row, fail-closed tenant_isolation RLS, app_rls grant, self-guard. `migrate deploy`.

-- ─────────────────────────────── 1) block_soil_snapshot (supersede-not-delete) ───────────────────────────────
CREATE TABLE "block_soil_snapshot" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "surveyAreaSymbol" TEXT,
    "surveyAreaVersion" TEXT,
    "polygonFingerprint" TEXT NOT NULL,
    "geometryVersion" INTEGER NOT NULL,
    "coveredPct" DECIMAL(9,6) NOT NULL,
    "coverageState" TEXT NOT NULL,
    "blockAreaSqM" DECIMAL(16,2) NOT NULL,
    "components" JSONB NOT NULL,
    "processingVersion" TEXT NOT NULL,
    "attribution" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "block_soil_snapshot_pkey" PRIMARY KEY ("id")
);
-- One CURRENT snapshot per block; superseded rows retained (partial unique — Prisma can't express this).
CREATE UNIQUE INDEX "block_soil_snapshot_one_current_key" ON "block_soil_snapshot"("tenantId", "blockId") WHERE "supersededAt" IS NULL;
CREATE INDEX "block_soil_snapshot_tenantId_idx" ON "block_soil_snapshot"("tenantId");
CREATE INDEX "block_soil_snapshot_tenantId_blockId_idx" ON "block_soil_snapshot"("tenantId", "blockId");
CREATE INDEX "block_soil_snapshot_tenantId_vineyardId_idx" ON "block_soil_snapshot"("tenantId", "vineyardId");
ALTER TABLE "block_soil_snapshot" ADD CONSTRAINT "block_soil_snapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "block_soil_snapshot" ADD CONSTRAINT "block_soil_snapshot_block_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 2) RLS (Phase-12 pattern) ───────────────────────────────
ALTER TABLE "block_soil_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "block_soil_snapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "block_soil_snapshot" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "block_soil_snapshot" TO app_rls;

-- ─────────────────────────────── 3) Fail this migration if the new table lacks full RLS + policy ───────────────────────────────
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['block_soil_snapshot'] LOOP
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
