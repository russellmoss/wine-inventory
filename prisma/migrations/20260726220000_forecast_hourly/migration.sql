-- Plan 097 Unit 3 — hourly forecast slots for the day-detail modal.
-- TENANT-1 template verbatim (AGENTS.md 9-step checklist), additive only: ONE new RLS table.
-- Replace semantics mirror the daily table (delete forward horizon then insert, same tx — C1).
-- Value columns NULLABLE (C7 — NWS precip-only QPF-bucket rows carry null temps); CHECKs are
-- NULL-tolerant. precipDurationH is the NATIVE amount-interval width (1 OM per-hour; 3/6 NWS
-- buckets) — the chart draws bars at that width (S6: never invent uniform rain).

CREATE TABLE "vineyard_forecast_hourly" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "hourStartUtc" TIMESTAMP(3) NOT NULL,
    "localDate" DATE NOT NULL,
    "localHour" INTEGER NOT NULL,
    "tempC" DECIMAL(6,3),
    "popPct" DECIMAL(6,3),
    "precipMm" DECIMAL(8,3),
    "precipDurationH" INTEGER NOT NULL DEFAULT 1,
    "conditionCode" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "windKph" DECIMAL(7,2),
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vineyard_forecast_hourly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vfh_tenant_vineyard_provider_hour_key" ON "vineyard_forecast_hourly"("tenantId", "vineyardId", "providerKey", "hourStartUtc");
CREATE UNIQUE INDEX "vineyard_forecast_hourly_tenantId_id_key" ON "vineyard_forecast_hourly"("tenantId", "id");
CREATE INDEX "vineyard_forecast_hourly_tenantId_idx" ON "vineyard_forecast_hourly"("tenantId");
CREATE INDEX "vfh_tenant_vineyard_localdate_idx" ON "vineyard_forecast_hourly"("tenantId", "vineyardId", "localDate");
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vineyard_forecast_hourly_tenantId_id_key" UNIQUE USING INDEX "vineyard_forecast_hourly_tenantId_id_key";
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vineyard_forecast_hourly_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vineyard_forecast_hourly_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- NULL-tolerant numeric sanity.
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vfh_precip_nonneg" CHECK ("precipMm" IS NULL OR "precipMm" >= 0);
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vfh_pop_range" CHECK ("popPct" IS NULL OR ("popPct" >= 0 AND "popPct" <= 100));
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vfh_duration_pos" CHECK ("precipDurationH" >= 1);
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vfh_hour_range" CHECK ("localHour" >= 0 AND "localHour" <= 23);
ALTER TABLE "vineyard_forecast_hourly" ADD CONSTRAINT "vfh_wind_nonneg" CHECK ("windKph" IS NULL OR "windKph" >= 0);

-- RLS (Phase-12 / TENANT-1 pattern)
ALTER TABLE "vineyard_forecast_hourly" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_forecast_hourly" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_forecast_hourly" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_forecast_hourly" TO app_rls;

-- Fail if RLS incomplete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vineyard_forecast_hourly' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on vineyard_forecast_hourly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vineyard_forecast_hourly' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on vineyard_forecast_hourly';
  END IF;
END
$$;
