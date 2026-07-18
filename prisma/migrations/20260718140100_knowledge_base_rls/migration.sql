-- Plan 079 Unit 1: tenant RLS on knowledge_source_subscription (Phase-12 pattern): ENABLE + FORCE + a
-- single tenant_isolation policy (USING + WITH CHECK on current_setting('app.tenant_id', true)).
-- FAIL-CLOSED: unset GUC -> NULL comparison -> zero rows. Owner (BYPASSRLS) bypasses for migrations.
--
-- Only the subscription table is RLS-scoped. The knowledge corpus tables (knowledge_source / blob /
-- document / url_observation / chunk / trusted_domain / candidate_source) are GLOBAL reference data
-- (like fx_rate): NO RLS, listed in GLOBAL_MODELS + mirrored in scripts/verify-tenant-isolation.ts.

ALTER TABLE "knowledge_source_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_source_subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "knowledge_source_subscription" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_source_subscription" TO app_rls;

-- Fail this migration if the table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['knowledge_source_subscription'] LOOP
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
