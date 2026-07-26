-- Plan 096 Phase 2 Unit 11 — the 7-day forecast table + NWS grid cache columns.
-- Copies the weather_schema RLS template verbatim (AGENTS.md 9-step tenant/RLS; TENANT-1).
-- Additive only: ONE new table + three nullable columns on vineyard_weather_config. No enums
-- (String unions). Forecast rows are REPLACED (delete-forward-horizon-then-insert, council C1);
-- the unique key is the replace identity, issuedAt is a staleness column. All value columns
-- NULLABLE (council C7 — the NWS afternoon-fetch day-1 has a low and no high). CHECKs are
-- NULL-tolerant by construction.

-- ─────────────────────────────── 1) vineyard_forecast_daily ───────────────────────────────
CREATE TABLE "vineyard_forecast_daily" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "tmaxC" DECIMAL(6,3),
    "tminC" DECIMAL(6,3),
    "precipMm" DECIMAL(8,3),
    "precipProbabilityPct" DECIMAL(6,3),
    "conditionCode" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "windMaxKph" DECIMAL(7,2),
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vineyard_forecast_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vfd_tenant_vineyard_provider_target_key" ON "vineyard_forecast_daily"("tenantId", "vineyardId", "providerKey", "targetDate");
CREATE UNIQUE INDEX "vineyard_forecast_daily_tenantId_id_key" ON "vineyard_forecast_daily"("tenantId", "id");
CREATE INDEX "vineyard_forecast_daily_tenantId_idx" ON "vineyard_forecast_daily"("tenantId");
CREATE INDEX "vfd_tenant_vineyard_target_idx" ON "vineyard_forecast_daily"("tenantId", "vineyardId", "targetDate");
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vineyard_forecast_daily_tenantId_id_key" UNIQUE USING INDEX "vineyard_forecast_daily_tenantId_id_key";
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vineyard_forecast_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vineyard_forecast_daily_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Numeric-sanity CHECKs (NULL-tolerant — a CHECK passes when an operand is NULL; council C7 day-1-no-high rows are legal).
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vfd_tmin_le_tmax" CHECK ("tminC" IS NULL OR "tmaxC" IS NULL OR "tminC" <= "tmaxC");
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vfd_precip_nonneg" CHECK ("precipMm" IS NULL OR "precipMm" >= 0);
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vfd_pop_range" CHECK ("precipProbabilityPct" IS NULL OR ("precipProbabilityPct" >= 0 AND "precipProbabilityPct" <= 100));
ALTER TABLE "vineyard_forecast_daily" ADD CONSTRAINT "vfd_wind_nonneg" CHECK ("windMaxKph" IS NULL OR "windMaxKph" >= 0);

-- ─────────────────────────────── 2) NWS grid cache on the config row ───────────────────────────────
ALTER TABLE "vineyard_weather_config" ADD COLUMN "nwsGridId" TEXT;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "nwsGridX" INTEGER;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "nwsGridY" INTEGER;

-- ─────────────────────────────── 3) RLS (Phase-12 / TENANT-1 pattern) ───────────────────────────────
ALTER TABLE "vineyard_forecast_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_forecast_daily" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_forecast_daily" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_forecast_daily" TO app_rls;

-- ─────────────────────────────── 4) Fail this migration if the table lacks full RLS + policy ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vineyard_forecast_daily' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on vineyard_forecast_daily';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vineyard_forecast_daily' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on vineyard_forecast_daily';
  END IF;
END
$$;
