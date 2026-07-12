-- Plan 053 B10: RLS on the two new tenant-scoped equipment tables (Phase-12 pattern): ENABLE + FORCE +
-- a single tenant_isolation policy with USING and WITH CHECK on current_setting('app.tenant_id', true).
-- FAIL-CLOSED: unset GUC → NULL comparison → zero rows. Owner (BYPASSRLS) bypasses for migrations.

ALTER TABLE "equipment_asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_asset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "equipment_asset" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_task_equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_task_equipment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_task_equipment" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "equipment_asset" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_task_equipment" TO app_rls;

-- Fail this migration if either table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['equipment_asset', 'work_order_task_equipment'] LOOP
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
