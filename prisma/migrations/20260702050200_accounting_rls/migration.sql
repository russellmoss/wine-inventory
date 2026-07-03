-- Phase 15 Unit 2 — Row-Level Security on the five new accounting tables, matching the Phase-12
-- pattern (20260701001000_rls_policies / 20260702000200_cost_rls): ENABLE + FORCE + a single
-- tenant_isolation policy with BOTH USING (reads/updates/deletes) and WITH CHECK (inserts/updates)
-- keyed on the transaction-scoped GUC app.tenant_id. FAIL-CLOSED: current_setting('app.tenant_id',
-- true) is NULL when unset -> ("tenantId" = NULL) is NULL (never true) -> zero rows / rejected. The
-- BYPASSRLS owner still bypasses so migrations are unaffected; the enumerator role (SEC-C3) has no
-- grant on these tables at all, so it never even reaches the policy.

ALTER TABLE "accounting_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_connection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "accounting_connection" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "oauth_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oauth_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "oauth_state" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vendor" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ap_export_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ap_export_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ap_export_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "accounting_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_delivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "accounting_delivery" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Fail this migration if any table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['accounting_connection', 'oauth_state', 'vendor', 'ap_export_event', 'accounting_delivery'] LOOP
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
