-- Plan 093 (custom-crush data foundation), Unit 6: the BillableWineConsumed table. A cross-owner blend is
-- ALLOWED (council C2); the consumed minority owner's fraction records a pending entry here for commercial
-- reconciliation. New table, no backfill. AGENTS.md 9-step: tenant FK, composite (K11) lot/owner FKs,
-- fail-closed tenant_isolation RLS, app_rls grant.

CREATE TABLE "billable_wine_consumed" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "operationId" INTEGER NOT NULL,
    "sourceLotId" TEXT NOT NULL,
    "consumedOwnerId" TEXT,
    "receivingOwnerId" TEXT,
    "volumeL" DECIMAL(12,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billable_wine_consumed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billable_wine_consumed_tenantId_operationId_sourceLotId_key" ON "billable_wine_consumed"("tenantId", "operationId", "sourceLotId");
CREATE INDEX "billable_wine_consumed_tenantId_idx" ON "billable_wine_consumed"("tenantId");
CREATE INDEX "billable_wine_consumed_tenantId_status_idx" ON "billable_wine_consumed"("tenantId", "status");

-- Tenant pin.
ALTER TABLE "billable_wine_consumed" ADD CONSTRAINT "billable_wine_consumed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Composite (K11) FKs: the consumed lot + the two owner refs. Owner refs are nullable (facility = NULL).
ALTER TABLE "billable_wine_consumed" ADD CONSTRAINT "billable_wine_consumed_lot_fkey" FOREIGN KEY ("tenantId", "sourceLotId") REFERENCES "lot"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billable_wine_consumed" ADD CONSTRAINT "billable_wine_consumed_consumed_owner_fkey" FOREIGN KEY ("tenantId", "consumedOwnerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billable_wine_consumed" ADD CONSTRAINT "billable_wine_consumed_receiving_owner_fkey" FOREIGN KEY ("tenantId", "receivingOwnerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The originating op (id is globally unique autoincrement → plain FK, no cross-tenant id risk).
ALTER TABLE "billable_wine_consumed" ADD CONSTRAINT "billable_wine_consumed_operation_fkey" FOREIGN KEY ("operationId") REFERENCES "lot_operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (Phase-12 pattern): ENABLE + FORCE + one fail-closed tenant_isolation policy.
ALTER TABLE "billable_wine_consumed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billable_wine_consumed" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "billable_wine_consumed" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "billable_wine_consumed" TO app_rls;

-- Fail this migration if the table somehow lacks RLS.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['billable_wine_consumed'] LOOP
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
