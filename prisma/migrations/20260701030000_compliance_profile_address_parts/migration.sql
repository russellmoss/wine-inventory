-- Structured filer address for the TTB compliance profile. The existing single-line
-- "operatedByAddress" stays as the composed value printed on Form 5120.17; these parts drive the
-- Settings / Compliance address UI (with type-ahead autofill). Same tenant-scoped table — RLS and
-- the tenantId FK are already in place, so no policy/index changes are needed here.
ALTER TABLE "compliance_profile" ADD COLUMN "operatedByStreet1" TEXT;
ALTER TABLE "compliance_profile" ADD COLUMN "operatedByStreet2" TEXT;
ALTER TABLE "compliance_profile" ADD COLUMN "operatedByCity" TEXT;
ALTER TABLE "compliance_profile" ADD COLUMN "operatedByState" TEXT;
ALTER TABLE "compliance_profile" ADD COLUMN "operatedByZip" TEXT;

-- Preserve any address already entered as a single line by seeding it into Street 1.
UPDATE "compliance_profile"
SET "operatedByStreet1" = "operatedByAddress"
WHERE "operatedByAddress" IS NOT NULL AND "operatedByStreet1" IS NULL;
