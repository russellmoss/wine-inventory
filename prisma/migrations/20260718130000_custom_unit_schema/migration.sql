-- Plan 075: user-defined measurement units, per tenant. Tenant-scoped; RLS lands in the next migration.
-- A custom unit = { dimension, perCanonical } (mirrors the built-in engine, src/lib/units/measure.ts).
-- No cross-table FK: materials reference a unit by its STRING, not by this row's id, so the only FK is the
-- tenant → organization pin. The (tenantId, id) unique is kept for peer parity with the other registries.

CREATE TABLE "custom_unit" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "perCanonical" DECIMAL(65,30) NOT NULL,
    "label" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "custom_unit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "custom_unit_tenantId_normalizedName_key" ON "custom_unit"("tenantId", "normalizedName");
CREATE UNIQUE INDEX "custom_unit_tenantId_id_key" ON "custom_unit"("tenantId", "id");
CREATE INDEX "custom_unit_tenantId_idx" ON "custom_unit"("tenantId");
-- Promote the (tenantId, id) unique index to a constraint (peer parity; FK-target-ready).
ALTER TABLE "custom_unit" ADD CONSTRAINT "custom_unit_tenantId_id_key" UNIQUE USING INDEX "custom_unit_tenantId_id_key";
ALTER TABLE "custom_unit" ADD CONSTRAINT "custom_unit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
