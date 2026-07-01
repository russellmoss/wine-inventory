-- Phase 14 Unit 7: Row-Level Security on the two new tenant-scoped compliance tables, matching the
-- Phase-12 pattern (20260701001000_rls_policies): ENABLE + FORCE + a single tenant_isolation policy
-- with BOTH USING (reads/updates/deletes) and WITH CHECK (inserts/updates) keyed on the
-- transaction-scoped GUC app.tenant_id. FAIL-CLOSED: current_setting('app.tenant_id', true) is NULL
-- when unset → ("tenantId" = NULL) is NULL (never true) → zero rows / rejected. The owner
-- (BYPASSRLS) still bypasses so migrations + the pre-activation app are unaffected.

ALTER TABLE "compliance_report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_report" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "compliance_report" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "compliance_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "compliance_profile" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES from 20260701000900_app_rls_role already
-- auto-grants owner-created tables, but grant explicitly so the checklist is self-evident here).
GRANT SELECT, INSERT, UPDATE, DELETE ON "compliance_report" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "compliance_profile" TO app_rls;

-- Fail this migration if either table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['compliance_report', 'compliance_profile'] LOOP
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
