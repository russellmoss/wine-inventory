-- Plan 077 (QBO vendor sync, Slice 2 — eager create-into-QBO): two columns-only adds, RLS-neutral (the existing
-- vendor + app_settings tenant_isolation policies already cover new columns — see the Plan-069 vendor_management_fields
-- precedent). syncStatus is a plain string (no enum → sidesteps the Windows ALTER TYPE rule); default 'synced' leaves
-- every existing vendor untouched. pushVendorsToQbo is the per-tenant opt-in, default off.
ALTER TABLE "vendor" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE "app_settings" ADD COLUMN "pushVendorsToQbo" BOOLEAN NOT NULL DEFAULT false;
