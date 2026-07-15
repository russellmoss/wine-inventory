-- Plan 069: first-class vendor management — extend the existing (Phase 15 QBO) vendor table with contact +
-- purchasing metadata. COLUMNS ONLY → RLS-neutral: the existing "vendor" tenant_isolation policy already
-- covers new columns. phone/email are REQUIRED in the setup UI but stay nullable at the DB so backfill and
-- non-UI paths (A/P find-or-create, assistant) never hard-error.
ALTER TABLE "vendor" ADD COLUMN "phone" TEXT;
ALTER TABLE "vendor" ADD COLUMN "email" TEXT;
ALTER TABLE "vendor" ADD COLUMN "contactName" TEXT;
ALTER TABLE "vendor" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "vendor" ADD COLUMN "poRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendor" ADD COLUMN "url" TEXT;
ALTER TABLE "vendor" ADD COLUMN "notes" TEXT;
ALTER TABLE "vendor" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
