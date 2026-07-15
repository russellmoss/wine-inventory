-- Plan 069: additional contacts per vendor (0..N). Tenant-scoped. A composite (tenantId, vendorId) FK pins each
-- contact to a vendor in the SAME tenant (K11, cross-tenant-safe). RLS lands in the next migration.

CREATE TABLE "vendor_contact" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_contact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_contact_tenantId_id_key" ON "vendor_contact"("tenantId", "id");
CREATE INDEX "vendor_contact_tenantId_idx" ON "vendor_contact"("tenantId");
CREATE INDEX "vendor_contact_tenantId_vendorId_idx" ON "vendor_contact"("tenantId", "vendorId");
-- Promote the (tenantId, id) unique index to a constraint (peer parity; FK-target-ready).
ALTER TABLE "vendor_contact" ADD CONSTRAINT "vendor_contact_tenantId_id_key" UNIQUE USING INDEX "vendor_contact_tenantId_id_key";
ALTER TABLE "vendor_contact" ADD CONSTRAINT "vendor_contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Composite cross-tenant FK: a contact's vendor must live in the same tenant (K11).
ALTER TABLE "vendor_contact" ADD CONSTRAINT "vendor_contact_vendor_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
