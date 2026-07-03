-- Phase 9.1 Unit 3 — Row-Level Security on the two new vessel-activity tables, matching the Phase-12
-- pattern (ENABLE + FORCE + a single tenant_isolation policy with BOTH USING and WITH CHECK keyed on the
-- transaction-scoped GUC app.tenant_id). FAIL-CLOSED: current_setting('app.tenant_id', true) is NULL when
-- unset → ("tenantId" = NULL) is NULL (never true) → zero rows / rejected. The BYPASSRLS owner still
-- bypasses so migrations are unaffected. (TENANT-1.)

ALTER TABLE "vessel_activity_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_activity_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_activity_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel_activity_supply_use" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_activity_supply_use" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_activity_supply_use" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Fail this migration if either table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['vessel_activity_event', 'vessel_activity_supply_use'] LOOP
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
