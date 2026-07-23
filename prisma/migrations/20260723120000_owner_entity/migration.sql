-- Plan 093 (custom-crush data foundation), Unit 1: the first-class `Owner` party.
-- Tenant-scoped (AGENTS.md 9-step): tenant FK → organization, per-tenant unique name, the (tenantId, id)
-- composite unique as a cross-tenant FK target (K11), and the standard fail-closed `tenant_isolation` RLS.
-- Facility's own wine carries NO Owner (ownerId NULL) — this table names CLIENTS only.
-- New table + a nullable-FK addition on `bond`; no data rewrite, no backfill (Unit 1 is additive).

-- 1) The owner table.
CREATE TABLE "owner" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "owner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "owner_tenantId_name_key" ON "owner"("tenantId", "name");
CREATE UNIQUE INDEX "owner_tenantId_id_key" ON "owner"("tenantId", "id");
CREATE INDEX "owner_tenantId_idx" ON "owner"("tenantId");

-- Promote the (tenantId, id) unique index to a constraint (peer parity; FK-target-ready for bond.ownerId).
ALTER TABLE "owner" ADD CONSTRAINT "owner_tenantId_id_key" UNIQUE USING INDEX "owner_tenantId_id_key";
-- Tenant pin.
ALTER TABLE "owner" ADD CONSTRAINT "owner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Wire the existing (vestigial, previously un-FK'd) bond.ownerId as a composite FK → owner(tenantId, id).
--    Nullable, so existing rows (all NULL today) validate trivially — no rewrite. K11 composite cross-tenant FK.
ALTER TABLE "bond" ADD CONSTRAINT "bond_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) RLS (Phase-12 pattern): ENABLE + FORCE + one tenant_isolation policy with USING and WITH CHECK on
--    current_setting('app.tenant_id', true). FAIL-CLOSED: unset GUC → NULL comparison → zero rows.
--    Owner (BYPASSRLS) bypasses for migrations. (INVARIANT TENANT-1.)
ALTER TABLE "owner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "owner" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "owner" TO app_rls;

-- Fail this migration if the table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['owner'] LOOP
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
