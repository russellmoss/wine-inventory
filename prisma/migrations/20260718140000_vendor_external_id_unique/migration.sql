-- Plan 075 (review fix): enforce "one QBO vendor ↔ one local vendor". A unique index on
-- (tenantId, externalVendorId); Postgres treats NULLs as DISTINCT, so unlinked vendors (NULL) stay
-- unconstrained while linked ones can't collide. Blocks accept/merge from silently linking two vendors to the
-- same QBO id. RLS-neutral (index on the existing tenant_isolation-protected `vendor` table).
CREATE UNIQUE INDEX "vendor_tenantId_externalVendorId_key" ON "vendor"("tenantId", "externalVendorId");
