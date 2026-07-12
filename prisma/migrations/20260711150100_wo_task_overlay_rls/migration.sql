-- Plan 053 C12: RLS on work_order_task_type_overlay (Phase-12 pattern).
ALTER TABLE "work_order_task_type_overlay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_task_type_overlay" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_task_type_overlay" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_task_type_overlay" TO app_rls;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['work_order_task_type_overlay'] LOOP
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
