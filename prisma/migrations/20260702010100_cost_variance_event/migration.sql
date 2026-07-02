-- Phase 8b Unit 13 (D12/D17): post-bottling cost variance events. When a backdated correction changes a
-- bottled lot's basis after its COGS snapshot froze, the snapshot stays IMMUTABLE and this append-only
-- table records the delta split across sold (→ period COGS variance) and on-hand (→ inventory value).
-- One new tenant-scoped table (Phase-12 checklist). No new enum. NOT deployed until `prisma migrate deploy`.

SET lock_timeout = '5s';

CREATE TABLE "cost_variance_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "triggeringOpId" INTEGER NOT NULL,
    "runId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "oldCostPerBottle" DECIMAL(18,2) NOT NULL,
    "newCostPerBottle" DECIMAL(18,2) NOT NULL,
    "goodBottles" INTEGER NOT NULL,
    "onHandBottles" INTEGER NOT NULL,
    "soldBottles" INTEGER NOT NULL,
    "soldDelta" DECIMAL(18,8) NOT NULL,
    "unsoldDelta" DECIMAL(18,8) NOT NULL,
    "totalDelta" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'KNOWN',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_variance_event_pkey" PRIMARY KEY ("id"),
    -- idempotent: at most one variance per snapshot per triggering correction op
    CONSTRAINT "cost_variance_event_tenantId_snapshotId_triggeringOpId_key" UNIQUE ("tenantId", "snapshotId", "triggeringOpId")
);

CREATE INDEX "cost_variance_event_tenantId_idx" ON "cost_variance_event"("tenantId");
CREATE INDEX "cost_variance_event_tenantId_snapshotId_idx" ON "cost_variance_event"("tenantId", "snapshotId");

-- FKs: tenantId → organization; composite (tenantId, snapshotId) → bottling_cost_snapshot(tenantId, id).
ALTER TABLE "cost_variance_event" ADD CONSTRAINT "cost_variance_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- bottling_cost_snapshot needs a (tenantId, id) unique to be a composite-FK target.
ALTER TABLE "bottling_cost_snapshot" ADD CONSTRAINT "bottling_cost_snapshot_tenantId_id_key" UNIQUE ("tenantId", "id");
ALTER TABLE "cost_variance_event" ADD CONSTRAINT "cost_variance_event_tenantId_snapshotId_fkey" FOREIGN KEY ("tenantId", "snapshotId") REFERENCES "bottling_cost_snapshot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- RLS (Phase-12 pattern: ENABLE + FORCE + fail-closed tenant_isolation).
ALTER TABLE "cost_variance_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_variance_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cost_variance_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "cost_variance_event" TO app_rls;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'cost_variance_event' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on cost_variance_event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cost_variance_event' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on cost_variance_event';
  END IF;
END
$$;
