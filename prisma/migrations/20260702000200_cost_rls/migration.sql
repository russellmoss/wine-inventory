-- Phase 8 Unit 1/2: Row-Level Security on the six new tenant-scoped cost tables, matching the
-- Phase-12 pattern (20260701001000_rls_policies / 20260701020300_compliance_rls): ENABLE + FORCE +
-- a single tenant_isolation policy with BOTH USING (reads/updates/deletes) and WITH CHECK
-- (inserts/updates) keyed on the transaction-scoped GUC app.tenant_id. FAIL-CLOSED:
-- current_setting('app.tenant_id', true) is NULL when unset → ("tenantId" = NULL) is NULL (never
-- true) → zero rows / rejected. The owner (BYPASSRLS) still bypasses so migrations + the
-- pre-activation app are unaffected.

ALTER TABLE "supply_lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supply_lot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "supply_lot" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "cost_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cost_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "supply_consumption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supply_consumption" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "supply_consumption" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "operation_cost_transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operation_cost_transfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "operation_cost_transfer" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "bottling_cost_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bottling_cost_snapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bottling_cost_snapshot" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_cost_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_cost_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_cost_state" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES from 20260701000900_app_rls_role already
-- auto-grants owner-created tables, but grant explicitly so the checklist is self-evident here).
GRANT SELECT, INSERT, UPDATE, DELETE ON "supply_lot" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "cost_line" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "supply_consumption" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "operation_cost_transfer" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "bottling_cost_snapshot" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lot_cost_state" TO app_rls;

-- Fail this migration if any table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['supply_lot', 'cost_line', 'supply_consumption', 'operation_cost_transfer', 'bottling_cost_snapshot', 'lot_cost_state'] LOOP
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
