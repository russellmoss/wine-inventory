-- Spray Intelligence S4 (phenology precision) — durable canopy-profile columns.
-- Additive only: three NULLABLE columns on two EXISTING tenant-scoped tables. No backfill, no NOT NULL,
-- no new table, no index (low-cardinality attributes read alongside a row already fetched by PK).
-- Enums landed in 20260727100000_phenology_block_enums (committed first).
--
-- AGENTS.md Phase-12 checklist: BOTH tables are already tenant-scoped with `tenantId` NOT NULL,
-- an FK to organization(id), @@unique([tenantId, id]) (vineyard_block) / @@unique([tenantId, name])
-- (variety), FORCE ROW LEVEL SECURITY and a fail-closed `tenant_isolation` policy, and app_rls DML
-- via the default privileges from ..._app_rls_role. Adding a column to an RLS-forced table inherits
-- the existing policy — there is nothing new to enable, and the U7 checklist entry for these two
-- tables stays COVERED BY THE EXISTING POLICIES. Recorded here so the next auditor does not re-derive it.
--
-- NULL means *not recorded*. Every consumer treats it as cannot-determine, never a default
-- (standing rule §3.6 — a coverage gap must never render as "no restriction").
-- Hand-written; applied via `migrate deploy` (the Windows migrate-diff→deploy rule, never `migrate dev`).

ALTER TABLE "vineyard_block" ADD COLUMN "trellisSystem" "TrellisSystem";
ALTER TABLE "vineyard_block" ADD COLUMN "clusterCompactness" "ClusterCompactness";
ALTER TABLE "variety" ADD COLUMN "clusterCompactness" "ClusterCompactness";
