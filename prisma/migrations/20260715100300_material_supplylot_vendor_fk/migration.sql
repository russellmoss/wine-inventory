-- Plan 069: link materials + individual supply lots to a MANAGED vendor. `vendorId` columns + composite
-- (tenantId, vendorId) FKs → vendor(tenantId, id) (K11, cross-tenant-safe; MATCH SIMPLE → a NULL vendorId is
-- unconstrained). Columns-only on RLS-forced tables → RLS-neutral. Nullable by design (UI-required + a seeded
-- "Unknown / Unspecified" fallback; existing rows backfilled by scripts/backfill-material-vendors.ts).
ALTER TABLE "cellar_material" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "supply_lot" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "cellar_material_tenantId_vendorId_idx" ON "cellar_material"("tenantId", "vendorId");
CREATE INDEX "supply_lot_tenantId_vendorId_idx" ON "supply_lot"("tenantId", "vendorId");

-- ON DELETE RESTRICT: a vendor still referenced by a material/lot can't be hard-deleted (use soft archive).
ALTER TABLE "cellar_material" ADD CONSTRAINT "cellar_material_vendor_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "supply_lot" ADD CONSTRAINT "supply_lot_vendor_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
