-- Plan 053 A5 Unit: Row-Level Security on work_order_dependency, matching the Phase-12 pattern
-- (ENABLE + FORCE + a single tenant_isolation policy with BOTH USING and WITH CHECK keyed on the
-- transaction-scoped GUC app.tenant_id). FAIL-CLOSED: current_setting('app.tenant_id', true) is NULL
-- when unset → ("tenantId" = NULL) is NULL (never true) → zero rows / rejected. The owner (BYPASSRLS)
-- still bypasses so migrations + maintenance are unaffected.

ALTER TABLE "work_order_dependency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_dependency" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "work_order_dependency" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES from 20260701000900_app_rls_role already
-- auto-grants owner-created tables, but grant explicitly so the checklist is self-evident here).
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_dependency" TO app_rls;

-- Fail this migration if the table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['work_order_dependency'] LOOP
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
