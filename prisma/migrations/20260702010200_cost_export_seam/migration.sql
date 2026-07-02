-- Phase 8b Unit 14 (D18): the Phase-15 accounting export seam. Two new tenant-scoped tables (Phase-12
-- checklist): account_mapping (per-tenant (component, tax-class) → debit/credit accounts) and
-- cost_export_event (immutable, idempotent, reversible export LINES that Phase 15 posts as-is). No new
-- enum. Reading cost_export_event IS the per-SKU/per-run export view. NOT deployed until `prisma migrate deploy`.

SET lock_timeout = '5s';

-- ─────────────── account_mapping ───────────────
CREATE TABLE "account_mapping" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "component" "CostComponent" NOT NULL,
    "taxClass" TEXT,
    "debitAccount" TEXT NOT NULL,
    "creditAccount" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mapping_pkey" PRIMARY KEY ("id")
);

-- ─────────────── cost_export_event ───────────────
CREATE TABLE "cost_export_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "postingKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceSnapshotId" TEXT,
    "sourceVarianceEventId" TEXT,
    "reversalOfExportEventId" TEXT,
    "runId" TEXT,
    "skuId" TEXT,
    "taxClass" TEXT,
    "component" "CostComponent" NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "debitAccount" TEXT NOT NULL,
    "creditAccount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'KNOWN',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "postedAt" TIMESTAMP(3),
    "externalSystemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_export_event_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Indexes / uniques ───────────────
CREATE UNIQUE INDEX "account_mapping_tenantId_component_taxClass_key" ON "account_mapping"("tenantId", "component", "taxClass");
CREATE INDEX "account_mapping_tenantId_idx" ON "account_mapping"("tenantId");

CREATE UNIQUE INDEX "cost_export_event_tenantId_postingKey_key" ON "cost_export_event"("tenantId", "postingKey");
CREATE INDEX "cost_export_event_tenantId_idx" ON "cost_export_event"("tenantId");
CREATE INDEX "cost_export_event_tenantId_skuId_runId_idx" ON "cost_export_event"("tenantId", "skuId", "runId");
CREATE INDEX "cost_export_event_tenantId_sourceSnapshotId_idx" ON "cost_export_event"("tenantId", "sourceSnapshotId");

-- ─────────────── FKs: tenantId → organization ───────────────
ALTER TABLE "account_mapping" ADD CONSTRAINT "account_mapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_export_event" ADD CONSTRAINT "cost_export_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── RLS (Phase-12 pattern) ───────────────
ALTER TABLE "account_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_mapping" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "account_mapping" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "cost_export_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_export_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cost_export_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "account_mapping" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cost_export_event" TO app_rls;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['account_mapping', 'cost_export_event'] LOOP
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
