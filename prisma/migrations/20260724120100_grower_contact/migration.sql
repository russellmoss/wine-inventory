-- Plan 095: additional contacts on a grower (0..N, beyond the grower's own primary contact), mirroring
-- vendor_contact. New tenant-scoped table → the FULL AGENTS.md 9-step: tenantId FK → organization,
-- (tenantId,id) composite-FK-target unique, composite (tenantId,growerId) FK → grower(tenantId,id) (K11),
-- fail-closed tenant_isolation RLS (ENABLE+FORCE+policy), and the app_rls DML grant. Contacts CASCADE-delete
-- with their grower (they never block a grower removal).

-- 1) The grower_contact table.
CREATE TABLE "grower_contact" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "growerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "grower_contact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "grower_contact_tenantId_id_key" ON "grower_contact"("tenantId", "id");
CREATE INDEX "grower_contact_tenantId_idx" ON "grower_contact"("tenantId");
CREATE INDEX "grower_contact_tenantId_growerId_idx" ON "grower_contact"("tenantId", "growerId");
ALTER TABLE "grower_contact" ADD CONSTRAINT "grower_contact_tenantId_id_key" UNIQUE USING INDEX "grower_contact_tenantId_id_key";
ALTER TABLE "grower_contact" ADD CONSTRAINT "grower_contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grower_contact" ADD CONSTRAINT "grower_contact_grower_fkey" FOREIGN KEY ("tenantId", "growerId") REFERENCES "grower"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) RLS on grower_contact (Phase-12 pattern, fail-closed).
ALTER TABLE "grower_contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grower_contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "grower_contact" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "grower_contact" TO app_rls;

-- Fail this migration if the table somehow lacks RLS.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['grower_contact'] LOOP
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
