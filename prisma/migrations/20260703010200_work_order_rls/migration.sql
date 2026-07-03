-- Phase 9 Unit 2 — Row-Level Security on the six new Work Order tables, matching the Phase-12 pattern
-- (ENABLE + FORCE + a single tenant_isolation policy with BOTH USING and WITH CHECK keyed on the
-- transaction-scoped GUC app.tenant_id). FAIL-CLOSED: current_setting('app.tenant_id', true) is NULL
-- when unset -> ("tenantId" = NULL) is NULL (never true) -> zero rows / rejected. The BYPASSRLS owner
-- still bypasses so migrations are unaffected.

ALTER TABLE "work_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_task" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_task" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_task_attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_task_attempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_task_attempt" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_template" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_template_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_template_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_template_version" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reservation" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Fail this migration if any table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['work_order', 'work_order_task', 'work_order_task_attempt', 'work_order_template', 'work_order_template_version', 'reservation'] LOOP
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
