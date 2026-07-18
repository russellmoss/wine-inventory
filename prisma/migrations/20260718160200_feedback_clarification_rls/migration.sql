-- Plan 079: RLS on feedback_clarification (Phase-12 / TENANT-1): ENABLE + FORCE + a single
-- tenant_isolation policy with USING and WITH CHECK on current_setting('app.tenant_id', true).
-- FAIL-CLOSED: unset GUC → NULL comparison → zero rows. Owner (BYPASSRLS) bypasses for migrations.

ALTER TABLE "feedback_clarification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_clarification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "feedback_clarification" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "feedback_clarification" TO app_rls;

-- Fail this migration if the table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['feedback_clarification'] LOOP
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
