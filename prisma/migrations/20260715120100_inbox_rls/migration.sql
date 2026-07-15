-- Plan 068 Unit 1: tenant RLS on the four inbox tables (Phase-12 pattern): ENABLE + FORCE + a single
-- tenant_isolation policy (USING + WITH CHECK on current_setting('app.tenant_id', true)). FAIL-CLOSED:
-- unset GUC -> NULL comparison -> zero rows. Owner (BYPASSRLS) bypasses for migrations. The per-user
-- boundary (owner-only reads on top of this) is added in the paired _inbox_user_rls migration (Unit 1b).

ALTER TABLE "inbox_notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "inbox_notification" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "direct_message_thread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "direct_message_thread" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "direct_message_thread" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "direct_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "direct_message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "direct_message" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "direct_message_attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "direct_message_attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "direct_message_attachment" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "inbox_notification" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "direct_message_thread" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "direct_message" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "direct_message_attachment" TO app_rls;

-- Fail this migration if any table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['inbox_notification', 'direct_message_thread', 'direct_message', 'direct_message_attachment'] LOOP
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
