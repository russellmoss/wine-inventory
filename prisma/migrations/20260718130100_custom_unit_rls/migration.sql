-- Plan 075: RLS on custom_unit (Phase-12 pattern): ENABLE + FORCE + a single tenant_isolation policy with
-- USING and WITH CHECK on current_setting('app.tenant_id', true). FAIL-CLOSED: unset GUC → NULL comparison →
-- zero rows. Owner (BYPASSRLS) bypasses for migrations. (INVARIANT TENANT-1.)

ALTER TABLE "custom_unit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_unit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "custom_unit" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "custom_unit" TO app_rls;

-- Fail this migration if the table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['custom_unit'] LOOP
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
