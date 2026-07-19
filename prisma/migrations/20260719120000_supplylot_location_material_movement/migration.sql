-- Plan 080 U1: per-location consumables.
-- Adds SupplyLot.locationId (+ splitFromLotId transfer lineage) as NULLABLE (expand phase — council S7),
-- and a new tenant-scoped, RLS-isolated material_movement ledger (mirror of stock_movement for wine).
-- SET NOT NULL on supply_lot.locationId is DEFERRED to a later migration (Unit 13a) after the backfill
-- (scripts/backfill-supplylot-location.ts) runs and all writers set locationId.
--
-- Hand-authored (Windows/Neon rule): `prisma migrate diff` is unusable in this repo — the live DB carries
-- hundreds of raw-SQL composite tenant FKs + RLS policies that the Prisma datamodel does not model, so the
-- diff emits a destructive DropForeignKey storm. All composite FKs / RLS / CHECK below are raw SQL (K11).

-- ── 1. SupplyLot: nullable location + transfer lineage ────────────────────────────────────────────────
ALTER TABLE "supply_lot" ADD COLUMN "locationId" TEXT;
ALTER TABLE "supply_lot" ADD COLUMN "splitFromLotId" TEXT;

-- per-location filter + per-location FIFO scan (partial on OPEN lots; deterministic (receivedAt,id) tiebreak,
-- mirroring the existing partial FIFO index on this table)
CREATE INDEX "supply_lot_tenantId_locationId_idx" ON "supply_lot" ("tenantId", "locationId");
CREATE INDEX "supply_lot_tenant_material_loc_fifo_idx"
  ON "supply_lot" ("tenantId", "materialId", "locationId", "receivedAt", "id")
  WHERE "qtyRemaining" > 0;

-- simple FK locationId -> location(id): mirrors bottled_inventory / stock_movement (location has no
-- (tenantId,id) unique; RLS on both tables provides tenant isolation). Nullable through expand — MATCH SIMPLE
-- leaves NULL rows unchecked until the backfill fills them.
ALTER TABLE "supply_lot"
  ADD CONSTRAINT "supply_lot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. material_movement: append-only per-location ledger ──────────────────────────────────────────────
CREATE TABLE "material_movement" (
  "tenantId"        TEXT           NOT NULL DEFAULT '',
  "id"              TEXT           NOT NULL,
  "createdAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"     TEXT,
  "createdByEmail"  TEXT           NOT NULL,
  "materialId"      TEXT           NOT NULL,
  "locationId"      TEXT           NOT NULL,
  "kind"            TEXT           NOT NULL,
  "deltaQty"        DECIMAL(18,6)  NOT NULL,
  "supplyLotId"     TEXT,
  "transferGroupId" TEXT,
  "reason"          TEXT,
  CONSTRAINT "material_movement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "material_movement_tenantId_id_key" ON "material_movement" ("tenantId", "id");
CREATE INDEX "material_movement_tenantId_idx" ON "material_movement" ("tenantId");
CREATE INDEX "material_movement_tenantId_materialId_locationId_idx" ON "material_movement" ("tenantId", "materialId", "locationId");
CREATE INDEX "material_movement_tenantId_transferGroupId_idx" ON "material_movement" ("tenantId", "transferGroupId");
CREATE INDEX "material_movement_tenantId_createdAt_idx" ON "material_movement" ("tenantId", "createdAt");

-- kind: validated string (keeps the house "no new Prisma enum" pattern) — CHECK-constrained to the 4 values
ALTER TABLE "material_movement"
  ADD CONSTRAINT "material_movement_kind_check"
  CHECK ("kind" IN ('RECEIVE', 'ADJUST', 'TRANSFER', 'CONSUME'));

-- integrity FKs (council S3). Composite-tenant (K11) where the (tenantId,id) target exists; simple FK for
-- location (as on supply_lot above); tenantId -> organization per the Phase-12 checklist.
ALTER TABLE "material_movement"
  ADD CONSTRAINT "material_movement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "material_movement"
  ADD CONSTRAINT "material_movement_tenantId_materialId_fkey"
  FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "material_movement"
  ADD CONSTRAINT "material_movement_tenantId_supplyLotId_fkey"
  FOREIGN KEY ("tenantId", "supplyLotId") REFERENCES "supply_lot"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "material_movement"
  ADD CONSTRAINT "material_movement_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. RLS (TENANT-1): ENABLE + FORCE + tenant_isolation (USING + WITH CHECK, fail-closed) ─────────────
ALTER TABLE "material_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_movement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "material_movement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "material_movement" TO app_rls;

-- Fail this migration if RLS is not fully enabled / the policy is missing (a table with no policy is a leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['material_movement'] LOOP
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
