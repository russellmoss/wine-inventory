-- Plan 075 (QBO vendor sync, Slice 1): the QBO→Cellarhand vendor-import review queue. A pulled QBO vendor with no
-- confident local match lands here for human accept/reject/merge. Tenant-scoped; a composite
-- (tenantId, suggestedVendorId) FK pins any suggested match to a vendor in the SAME tenant (K11). RLS lands next.

CREATE TABLE "vendor_import_candidate" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "externalVendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suggestedVendorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currencyVariantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_import_candidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_import_candidate_tenantId_id_key" ON "vendor_import_candidate"("tenantId", "id");
CREATE UNIQUE INDEX "vendor_import_candidate_tenantId_externalVendorId_key" ON "vendor_import_candidate"("tenantId", "externalVendorId");
CREATE INDEX "vendor_import_candidate_tenantId_idx" ON "vendor_import_candidate"("tenantId");
-- Promote the (tenantId, id) unique index to a constraint (peer parity; FK-target-ready).
ALTER TABLE "vendor_import_candidate" ADD CONSTRAINT "vendor_import_candidate_tenantId_id_key" UNIQUE USING INDEX "vendor_import_candidate_tenantId_id_key";
ALTER TABLE "vendor_import_candidate" ADD CONSTRAINT "vendor_import_candidate_tenantId_externalVendorId_key" UNIQUE USING INDEX "vendor_import_candidate_tenantId_externalVendorId_key";
ALTER TABLE "vendor_import_candidate" ADD CONSTRAINT "vendor_import_candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Composite cross-tenant FK: a suggested match must be a vendor in the same tenant (K11). Nullable → NULL passes.
-- ON DELETE SET NULL on the column list so a deleted vendor just clears the suggestion (tenantId stays NOT NULL).
ALTER TABLE "vendor_import_candidate" ADD CONSTRAINT "vendor_import_candidate_suggested_vendor_fkey" FOREIGN KEY ("tenantId", "suggestedVendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("suggestedVendorId");
