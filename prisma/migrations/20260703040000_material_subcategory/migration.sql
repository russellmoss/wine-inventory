-- Phase 034 Unit 2: add an optional, user-defined subcategory to the material catalog.
-- COLUMNS-ONLY on an existing tenant-scoped, already-RLS-FORCED table (cellar_material), so the
-- tenant_isolation policy already covers the new column for every row (Phase-12 checklist: RLS is
-- per-table, not per-column; app_rls's table-level DML grant covers new columns). No enum, no index,
-- no FK, no identity change (@@unique([tenantId, kind, normalizedKey]) is unchanged) — subcategory is
-- organizational only. Nullable: existing rows fall back to the built-in label derived from `kind`.
ALTER TABLE "cellar_material" ADD COLUMN "subcategory" TEXT;
