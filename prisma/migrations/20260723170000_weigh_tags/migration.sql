-- Plan 093 (custom-crush intake), Unit 9: weigh-tags. A per-TRUCK WeighTag (gross/tare/net) → per-bin
-- WeighTagLine (grower/owner/block) → HarvestPick. Gap-free per-tenant tag number via a counter row
-- (SELECT ... FOR UPDATE in the write tx). Void-not-delete. New tables + one nullable-FK column on
-- harvest_pick; no backfill. AGENTS.md 9-step for each tenant-scoped table.

-- 1) The per-tenant gap-free tag-number counter (one row per tenant; tenantId IS the key).
CREATE TABLE "weigh_tag_counter" (
    "tenantId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "weigh_tag_counter_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "weigh_tag_counter" ADD CONSTRAINT "weigh_tag_counter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) The truck scale-ticket header.
CREATE TABLE "weigh_tag" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "tagNumber" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weighmaster" TEXT,
    "truck" TEXT,
    "grossKg" DECIMAL(12,3),
    "tareKg" DECIMAL(12,3),
    "netKg" DECIMAL(12,3),
    "voidedAt" TIMESTAMP(3),
    "voidedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weigh_tag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "weigh_tag_tenantId_tagNumber_key" ON "weigh_tag"("tenantId", "tagNumber");
CREATE UNIQUE INDEX "weigh_tag_tenantId_id_key" ON "weigh_tag"("tenantId", "id");
CREATE INDEX "weigh_tag_tenantId_idx" ON "weigh_tag"("tenantId");
ALTER TABLE "weigh_tag" ADD CONSTRAINT "weigh_tag_tenantId_id_key" UNIQUE USING INDEX "weigh_tag_tenantId_id_key";
ALTER TABLE "weigh_tag" ADD CONSTRAINT "weigh_tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) The per-bin line.
CREATE TABLE "weigh_tag_line" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "weighTagId" TEXT NOT NULL,
    "binOrGroup" TEXT,
    "growerId" TEXT,
    "ownerId" TEXT,
    "blockId" TEXT,
    "netKg" DECIMAL(12,3),
    "needsOwnerAssignment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weigh_tag_line_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "weigh_tag_line_tenantId_id_key" ON "weigh_tag_line"("tenantId", "id");
CREATE INDEX "weigh_tag_line_tenantId_idx" ON "weigh_tag_line"("tenantId");
CREATE INDEX "weigh_tag_line_tenantId_weighTagId_idx" ON "weigh_tag_line"("tenantId", "weighTagId");
CREATE INDEX "weigh_tag_line_tenantId_ownerId_idx" ON "weigh_tag_line"("tenantId", "ownerId");
CREATE INDEX "weigh_tag_line_tenantId_growerId_idx" ON "weigh_tag_line"("tenantId", "growerId");
ALTER TABLE "weigh_tag_line" ADD CONSTRAINT "weigh_tag_line_tenantId_id_key" UNIQUE USING INDEX "weigh_tag_line_tenantId_id_key";
ALTER TABLE "weigh_tag_line" ADD CONSTRAINT "weigh_tag_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- weighTagId: the Prisma relation (plain FK on id, cascade with the tag).
ALTER TABLE "weigh_tag_line" ADD CONSTRAINT "weigh_tag_line_weighTagId_fkey" FOREIGN KEY ("weighTagId") REFERENCES "weigh_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- grower/owner/block: composite (K11) raw-SQL FKs (nullable).
ALTER TABLE "weigh_tag_line" ADD CONSTRAINT "weigh_tag_line_grower_fkey" FOREIGN KEY ("tenantId", "growerId") REFERENCES "grower"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weigh_tag_line" ADD CONSTRAINT "weigh_tag_line_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weigh_tag_line" ADD CONSTRAINT "weigh_tag_line_block_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) harvest_pick.weighTagLineId (nullable, composite K11 FK → weigh_tag_line; onDelete Restrict).
ALTER TABLE "harvest_pick" ADD COLUMN "weighTagLineId" TEXT;
CREATE INDEX "harvest_pick_tenantId_weighTagLineId_idx" ON "harvest_pick"("tenantId", "weighTagLineId");
ALTER TABLE "harvest_pick" ADD CONSTRAINT "harvest_pick_weigh_tag_line_fkey" FOREIGN KEY ("tenantId", "weighTagLineId") REFERENCES "weigh_tag_line"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) RLS on the three tenant-scoped weigh-tag tables (Phase-12 pattern).
ALTER TABLE "weigh_tag_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weigh_tag_counter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "weigh_tag_counter" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "weigh_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weigh_tag" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "weigh_tag" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "weigh_tag_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weigh_tag_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "weigh_tag_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "weigh_tag_counter" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "weigh_tag" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "weigh_tag_line" TO app_rls;

-- Fail this migration if any weigh-tag table lacks RLS.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['weigh_tag_counter','weigh_tag','weigh_tag_line'] LOOP
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
