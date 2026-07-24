-- Plan 095: Vendor-parity for Grower — structured contact columns + a `vendorId` link to a Vendor row.
-- COLUMNS ONLY on the already-RLS `grower` table: no RLS change needed for pure column adds (the existing
-- grower tenant_isolation policy covers new columns). `vendorId` is a nullable composite FK →
-- vendor(tenantId,id) (K11), mirroring vineyard.growerId. Estate growers stay NULL (you don't pay yourself).
-- Backfill folds the legacy free-text `contact` into the structured fields WITHOUT dropping `contact`
-- (kept for provenance). Columns stay nullable + UI-enforced-required = backfill-then-enforce; non-UI
-- paths (assistant, seed) never hard-error (mirrors Vendor's phone/email posture).

-- 1) Structured contact columns (nullable).
ALTER TABLE "grower" ADD COLUMN "contactName" TEXT;
ALTER TABLE "grower" ADD COLUMN "phone" TEXT;
ALTER TABLE "grower" ADD COLUMN "email" TEXT;

-- 2) Best-effort backfill of the legacy free-text `contact`. Never overwrites an already-set field; leaves
--    `contact` intact. An "@" in the string → treat it as an email; otherwise park it as the contact name.
UPDATE "grower"
   SET "email" = "contact"
 WHERE "email" IS NULL AND "contact" IS NOT NULL AND "contact" LIKE '%@%';
UPDATE "grower"
   SET "contactName" = "contact"
 WHERE "contactName" IS NULL AND "contact" IS NOT NULL AND "contact" NOT LIKE '%@%';

-- 3) vendorId link (nullable composite FK → vendor(tenantId,id), K11). vendor already carries the
--    (tenantId,id) composite unique this FK targets.
ALTER TABLE "grower" ADD COLUMN "vendorId" TEXT;
CREATE INDEX "grower_tenantId_vendorId_idx" ON "grower"("tenantId", "vendorId");
ALTER TABLE "grower" ADD CONSTRAINT "grower_vendor_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
