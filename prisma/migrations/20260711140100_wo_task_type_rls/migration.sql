-- Plan 053 C11: RLS on work_order_task_type (Phase-12 pattern) — ENABLE + FORCE + a tenant_isolation
-- policy with USING and WITH CHECK on current_setting('app.tenant_id', true). FAIL-CLOSED when unset.
ALTER TABLE "work_order_task_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_task_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_task_type" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_task_type" TO app_rls;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['work_order_task_type'] LOOP
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
