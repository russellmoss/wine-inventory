-- Plan 080 U3: costed equipment.
-- Lets an EquipmentAsset carry its acquisition cost + invoice provenance so an equipment purchase can hit
-- the books (Fixed Assets) the way a consumable purchase already does. PURELY ADDITIVE: every column is
-- nullable with no default beyond `currency`, so existing assets stay uncosted and no backfill is needed.
--
-- RLS: equipment_asset already has ENABLE + FORCE + tenant_isolation (20260711132100_equipment_rls) and the
-- app_rls DML grants come from the role's default privileges — adding columns changes neither (TENANT-1).
--
-- Hand-authored (Windows/Neon rule): `prisma migrate diff` is unusable here — the live DB carries hundreds of
-- raw-SQL composite tenant FKs + RLS policies the Prisma datamodel does not model, so a diff emits a
-- destructive DropForeignKey storm.

-- ── 1. Acquisition cost, in the tenant BASE currency (COST-4: the roll-up basis) ──────────────────────
ALTER TABLE "equipment_asset" ADD COLUMN "purchaseCostBase" DECIMAL(18,8);
ALTER TABLE "equipment_asset" ADD COLUMN "currency" TEXT DEFAULT 'USD';

-- ── 2. Immutable foreign-invoice provenance (IAS 21 historical cost) — mirrors supply_lot's quintet ────
-- Audit + reversal only; NEVER enters the roll-up and is never revalued. All NULL for a base-currency buy.
ALTER TABLE "equipment_asset" ADD COLUMN "foreignPurchaseCost" DECIMAL(18,8);
ALTER TABLE "equipment_asset" ADD COLUMN "foreignCurrency" TEXT;
ALTER TABLE "equipment_asset" ADD COLUMN "fxRate" DECIMAL(18,8);
ALTER TABLE "equipment_asset" ADD COLUMN "fxRateDate" TIMESTAMP(3);
ALTER TABLE "equipment_asset" ADD COLUMN "fxRateSource" TEXT;

-- ── 3. Purchase metadata + the managed vendor ─────────────────────────────────────────────────────────
ALTER TABLE "equipment_asset" ADD COLUMN "purchaseDate" TIMESTAMP(3);
ALTER TABLE "equipment_asset" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "equipment_asset_tenantId_vendorId_idx" ON "equipment_asset" ("tenantId", "vendorId");

-- Composite-tenant FK (K11) → vendor(tenantId, id), matching cellar_material / supply_lot exactly. MATCH
-- SIMPLE leaves the NULL-vendor rows (every existing asset) unchecked, so this validates immediately.
ALTER TABLE "equipment_asset"
  ADD CONSTRAINT "equipment_asset_vendor_fkey"
  FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- Fail this migration if equipment_asset's isolation ever regressed (a domain table with no policy is a leak).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'equipment_asset' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on equipment_asset';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'equipment_asset' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on equipment_asset';
  END IF;
END
$$;
