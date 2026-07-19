-- Plan 080 U13a: make the consumables->Location references COMPOSITE-tenant FKs (K11).
--
-- U1 shipped supply_lot.locationId (and material_movement.locationId) with a SIMPLE FK -> location(id),
-- mirroring bottled_inventory/stock_movement, because `location` had no (tenantId, id) unique to point at.
-- The U13a tenant-isolation case proved the consequence: a supply_lot in tenant B could be pinned to tenant
-- A's location. RLS hides another tenant's locations from the app role, so this was not reachable through
-- the UI — but the DATABASE did not enforce it, and the Phase-12 checklist (step 5) requires that a
-- cross-tenant-risk FK be composite. This closes that.
--
-- Safe to apply: verified 0 cross-tenant supply_lot -> location rows and 0 NULL locationId before writing
-- this, so both composite FKs validate immediately.

-- ── 1. The composite-FK target on location ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "location_tenantId_id_key" ON "location" ("tenantId", "id");

-- ── 2. supply_lot.locationId: simple -> composite ─────────────────────────────────────────────────────
ALTER TABLE "supply_lot" DROP CONSTRAINT "supply_lot_locationId_fkey";
ALTER TABLE "supply_lot"
  ADD CONSTRAINT "supply_lot_tenant_location_fkey"
  FOREIGN KEY ("tenantId", "locationId") REFERENCES "location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. material_movement.locationId: simple -> composite ──────────────────────────────────────────────
ALTER TABLE "material_movement" DROP CONSTRAINT "material_movement_locationId_fkey";
ALTER TABLE "material_movement"
  ADD CONSTRAINT "material_movement_tenant_location_fkey"
  FOREIGN KEY ("tenantId", "locationId") REFERENCES "location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4. Fail closed if a cross-tenant reference somehow exists (would mean the FKs above are a lie) ─────
DO $$
DECLARE
  bad BIGINT;
BEGIN
  SELECT COUNT(*) INTO bad
  FROM "supply_lot" sl JOIN "location" l ON l."id" = sl."locationId"
  WHERE l."tenantId" <> sl."tenantId";
  IF bad > 0 THEN
    RAISE EXCEPTION 'supply_lot has % cross-tenant location reference(s) — fix before enforcing the composite FK', bad;
  END IF;

  SELECT COUNT(*) INTO bad
  FROM "material_movement" mm JOIN "location" l ON l."id" = mm."locationId"
  WHERE l."tenantId" <> mm."tenantId";
  IF bad > 0 THEN
    RAISE EXCEPTION 'material_movement has % cross-tenant location reference(s)', bad;
  END IF;
END
$$;
