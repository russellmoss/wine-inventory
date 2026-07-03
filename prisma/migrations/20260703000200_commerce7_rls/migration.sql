-- Phase 16 Unit 1 — Row-Level Security on the five new Commerce7 tables, matching the Phase-12/15
-- pattern (ENABLE + FORCE + a single tenant_isolation policy with BOTH USING and WITH CHECK keyed on
-- the transaction-scoped GUC app.tenant_id). FAIL-CLOSED: current_setting('app.tenant_id', true) is
-- NULL when unset -> ("tenantId" = NULL) is NULL (never true) -> zero rows / rejected. The BYPASSRLS
-- owner still bypasses so migrations are unaffected; the accounting_enumerator role has no grant on
-- these tables, so it never reaches the policy.

ALTER TABLE "commerce7_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce7_connection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "commerce7_connection" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "commerce7_install_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce7_install_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "commerce7_install_state" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "commerce7_sku_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce7_sku_map" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "commerce7_sku_map" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "commerce7_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce7_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "commerce7_order" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "sales_export_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_export_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sales_export_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Fail this migration if any table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['commerce7_connection', 'commerce7_install_state', 'commerce7_sku_map', 'commerce7_order', 'sales_export_event'] LOOP
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
