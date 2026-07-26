-- Plan 096 Phase 3 Unit 19 — alert thresholds + escalation state + banner storage.
-- SECOND migration of the phase (the isolated InboxKind ALTER TYPE precedes it). Additive only:
-- one new RLS table + config columns with defaults (no backfill needed — defaults ARE the values).
-- TENANT-1 template verbatim, self-verifying.

-- ─────────────────────────────── 1) Config: per-vineyard thresholds (metric) + NWS banner storage ───────────────────────────────
ALTER TABLE "vineyard_weather_config" ADD COLUMN "frostWatchC" DECIMAL(6,3) NOT NULL DEFAULT 2;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "frostWarnC" DECIMAL(6,3) NOT NULL DEFAULT 0;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "hardFreezeC" DECIMAL(6,3) NOT NULL DEFAULT -2;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "heatWatchC" DECIMAL(6,3) NOT NULL DEFAULT 35;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "extremeHeatC" DECIMAL(6,3) NOT NULL DEFAULT 38;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "activeAlertsJson" JSONB;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "activeAlertsFetchedAt" TIMESTAMP(3);
-- Sanity: the frost ladder must be ordered (watch ≥ warn ≥ hard freeze) and heat ascending.
ALTER TABLE "vineyard_weather_config" ADD CONSTRAINT "vwc_frost_ladder" CHECK ("frostWatchC" >= "frostWarnC" AND "frostWarnC" >= "hardFreezeC");
ALTER TABLE "vineyard_weather_config" ADD CONSTRAINT "vwc_heat_ladder" CHECK ("extremeHeatC" >= "heatWatchC");

-- ─────────────────────────────── 2) vineyard_weather_alert_state ───────────────────────────────
CREATE TABLE "vineyard_weather_alert_state" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "alertType" TEXT NOT NULL,
    "notifiedTier" TEXT,
    "notifiedRank" INTEGER NOT NULL DEFAULT 0,
    "lastNotifiedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vineyard_weather_alert_state_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vwas_tenant_vineyard_target_type_key" ON "vineyard_weather_alert_state"("tenantId", "vineyardId", "targetDate", "alertType");
CREATE UNIQUE INDEX "vineyard_weather_alert_state_tenantId_id_key" ON "vineyard_weather_alert_state"("tenantId", "id");
CREATE INDEX "vineyard_weather_alert_state_tenantId_idx" ON "vineyard_weather_alert_state"("tenantId");
ALTER TABLE "vineyard_weather_alert_state" ADD CONSTRAINT "vineyard_weather_alert_state_tenantId_id_key" UNIQUE USING INDEX "vineyard_weather_alert_state_tenantId_id_key";
ALTER TABLE "vineyard_weather_alert_state" ADD CONSTRAINT "vineyard_weather_alert_state_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vineyard_weather_alert_state" ADD CONSTRAINT "vineyard_weather_alert_state_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vineyard_weather_alert_state" ADD CONSTRAINT "vwas_rank_nonneg" CHECK ("notifiedRank" >= 0);

-- ─────────────────────────────── 3) RLS (Phase-12 / TENANT-1 pattern) ───────────────────────────────
ALTER TABLE "vineyard_weather_alert_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_weather_alert_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_weather_alert_state" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "vineyard_weather_alert_state" TO app_rls;

-- ─────────────────────────────── 4) Fail if RLS incomplete ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vineyard_weather_alert_state' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on vineyard_weather_alert_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vineyard_weather_alert_state' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on vineyard_weather_alert_state';
  END IF;
END
$$;
