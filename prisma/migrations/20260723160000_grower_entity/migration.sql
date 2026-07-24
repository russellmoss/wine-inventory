-- Plan 093 (custom-crush intake), Unit 8: the first-class Grower entity + growerId on vineyard/block.
-- New table + two nullable-FK column additions; no backfill (VineyardDetail.manager stays as legacy
-- free-text). AGENTS.md 9-step: tenant FK, per-tenant unique name, (tenantId,id) composite FK target,
-- fail-closed tenant_isolation RLS, app_rls grant. growerId FKs are composite (K11), nullable.

-- 1) The grower table.
CREATE TABLE "grower" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "contact" TEXT,
    "address" TEXT,
    "isEstate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "grower_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "grower_tenantId_name_key" ON "grower"("tenantId", "name");
CREATE UNIQUE INDEX "grower_tenantId_id_key" ON "grower"("tenantId", "id");
CREATE INDEX "grower_tenantId_idx" ON "grower"("tenantId");
ALTER TABLE "grower" ADD CONSTRAINT "grower_tenantId_id_key" UNIQUE USING INDEX "grower_tenantId_id_key";
ALTER TABLE "grower" ADD CONSTRAINT "grower_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) growerId on vineyard + vineyard_block (nullable, composite FK → grower(tenantId,id), K11).
ALTER TABLE "vineyard" ADD COLUMN "growerId" TEXT;
CREATE INDEX "vineyard_tenantId_growerId_idx" ON "vineyard"("tenantId", "growerId");
ALTER TABLE "vineyard" ADD CONSTRAINT "vineyard_grower_fkey" FOREIGN KEY ("tenantId", "growerId") REFERENCES "grower"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vineyard_block" ADD COLUMN "growerId" TEXT;
CREATE INDEX "vineyard_block_tenantId_growerId_idx" ON "vineyard_block"("tenantId", "growerId");
ALTER TABLE "vineyard_block" ADD CONSTRAINT "vineyard_block_grower_fkey" FOREIGN KEY ("tenantId", "growerId") REFERENCES "grower"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) RLS on grower (Phase-12 pattern).
ALTER TABLE "grower" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grower" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "grower" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "grower" TO app_rls;

-- Fail this migration if the table somehow lacks RLS.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['grower'] LOOP
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
