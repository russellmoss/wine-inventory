-- plan-027 Unit 1: RLS on the two compliance-reminder tables (Phase-12 pattern: ENABLE + FORCE +
-- tenant_isolation policy with USING + WITH CHECK on the transaction-scoped GUC app.tenant_id;
-- fail-closed when unset). Owner (BYPASSRLS) still bypasses so migrations + the cron sweep (system
-- role) are unaffected — the cron re-sets app.tenant_id per tenant before its tenant-scoped reads/writes.

ALTER TABLE "compliance_reminder_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_reminder_preference" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "compliance_reminder_preference" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "compliance_reminder_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_reminder_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "compliance_reminder_log" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "compliance_reminder_preference" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "compliance_reminder_log" TO app_rls;

DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['compliance_reminder_preference', 'compliance_reminder_log'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', r;
    END IF;
  END LOOP;
END $$;
