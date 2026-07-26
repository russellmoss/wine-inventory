-- Vineyard Intelligence P8 (Weather & Climate spine, Release 4A) — schema + RLS.
-- Copies the P2 ndvi_schema structure (AGENTS.md 9-step tenant/RLS). Additive only: THREE new tables
-- (vineyard_climate_daily, vineyard_weather_config, weather_provider_usage) + ONE nullable-with-default
-- column on vineyard (weatherAutoRefresh). No enums (String unions — sidesteps the Windows enum rule).
-- No NOT NULL backfill on existing data, no data mutation. Cross-tenant-risk FKs are RAW composite
-- (tenantId, refId)→(tenantId, id). Council R1/R2: daily fact table authoritative (no mutable snapshot),
-- localDate is the vineyard-local civil day, WeatherProviderUsage gated on a DAILY key. Numeric-sanity CHECKs
-- (tminC≤tmaxC, RH 0..100, precip≥0) per council R1/Codex#7. Applied via `migrate deploy` (owner, BYPASSRLS).

-- ─────────────────────────────── 1) vineyard_climate_daily (authoritative daily series) ───────────────────────────────
CREATE TABLE "vineyard_climate_daily" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "tmaxC" DECIMAL(6,3),
    "tminC" DECIMAL(6,3),
    "precipMm" DECIMAL(8,3),
    "rhMaxPct" DECIMAL(6,3),
    "rhMinPct" DECIMAL(6,3),
    "dataStatus" TEXT NOT NULL DEFAULT 'PROVISIONAL',
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vineyard_climate_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vcd_tenant_vineyard_localDate_provider_key" ON "vineyard_climate_daily"("tenantId", "vineyardId", "localDate", "providerKey");
CREATE UNIQUE INDEX "vineyard_climate_daily_tenantId_id_key" ON "vineyard_climate_daily"("tenantId", "id");
CREATE INDEX "vineyard_climate_daily_tenantId_idx" ON "vineyard_climate_daily"("tenantId");
CREATE INDEX "vcd_tenant_vineyard_localDate_idx" ON "vineyard_climate_daily"("tenantId", "vineyardId", "localDate");
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vineyard_climate_daily_tenantId_id_key" UNIQUE USING INDEX "vineyard_climate_daily_tenantId_id_key";
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vineyard_climate_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vineyard_climate_daily_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Numeric-sanity CHECKs (council R1/Codex#7). NULL-tolerant: a CHECK passes when an operand is NULL.
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vcd_tmin_le_tmax" CHECK ("tminC" IS NULL OR "tmaxC" IS NULL OR "tminC" <= "tmaxC");
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vcd_rhmax_range" CHECK ("rhMaxPct" IS NULL OR ("rhMaxPct" >= 0 AND "rhMaxPct" <= 100));
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vcd_rhmin_range" CHECK ("rhMinPct" IS NULL OR ("rhMinPct" >= 0 AND "rhMinPct" <= 100));
ALTER TABLE "vineyard_climate_daily" ADD CONSTRAINT "vcd_precip_nonneg" CHECK ("precipMm" IS NULL OR "precipMm" >= 0);

-- ─────────────────────────────── 2) vineyard_weather_config (1:1 per vineyard, replaces the snapshot) ───────────────────────────────
CREATE TABLE "vineyard_weather_config" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "primaryProviderKey" TEXT NOT NULL,
    "primaryProviderOverride" TEXT,
    "stationId" TEXT,
    "stationName" TEXT,
    "stationDistanceM" DECIMAL(12,2),
    "stationElevationDeltaM" DECIMAL(10,2),
    "siteElevationM" DECIMAL(10,2),
    "coverageState" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "attribution" TEXT,
    "lastRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vineyard_weather_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vwc_tenant_vineyard_key" ON "vineyard_weather_config"("tenantId", "vineyardId");
CREATE UNIQUE INDEX "vineyard_weather_config_tenantId_id_key" ON "vineyard_weather_config"("tenantId", "id");
CREATE INDEX "vineyard_weather_config_tenantId_idx" ON "vineyard_weather_config"("tenantId");
ALTER TABLE "vineyard_weather_config" ADD CONSTRAINT "vineyard_weather_config_tenantId_id_key" UNIQUE USING INDEX "vineyard_weather_config_tenantId_id_key";
ALTER TABLE "vineyard_weather_config" ADD CONSTRAINT "vineyard_weather_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vineyard_weather_config" ADD CONSTRAINT "vineyard_weather_config_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 3) weather_provider_usage (per-tenant/day/provider quota) ───────────────────────────────
CREATE TABLE "weather_provider_usage" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "dayKey" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weather_provider_usage_pkey" PRIMARY KEY ("tenantId", "dayKey", "provider")
);
CREATE INDEX "weather_provider_usage_tenantId_idx" ON "weather_provider_usage"("tenantId");
ALTER TABLE "weather_provider_usage" ADD CONSTRAINT "weather_provider_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────── 4) vineyard: DARK auto-refresh flag (additive, default false) ───────────────────────────────
ALTER TABLE "vineyard" ADD COLUMN "weatherAutoRefresh" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────── 5) RLS (Phase-12 / TENANT-1 pattern) on all three new tables ───────────────────────────────
ALTER TABLE "vineyard_climate_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_climate_daily" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_climate_daily" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vineyard_weather_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_weather_config" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_weather_config" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "weather_provider_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weather_provider_usage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "weather_provider_usage" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_climate_daily" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_weather_config" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "weather_provider_usage" TO app_rls;

-- ─────────────────────────────── 6) Fail this migration if any new table lacks full RLS + policy ───────────────────────────────
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['vineyard_climate_daily', 'vineyard_weather_config', 'weather_provider_usage'] LOOP
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
