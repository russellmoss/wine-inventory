-- Plan 039 Unit 1: capture field pH + TA on each harvest pick (optional, nullable).
-- Column-only add on an existing RLS-forced tenant table (harvest_pick) — no backfill,
-- no NOT NULL, no enum, no RLS change. Precision + ranges mirror the analyte registry
-- (src/lib/chemistry/analytes.ts): pH 2.5–4.5 (2 dp); TA g/L tartaric, ≥ 0 (1 dp).

-- AlterTable
ALTER TABLE "harvest_pick" ADD COLUMN     "phAtPick" DECIMAL(4,2);
ALTER TABLE "harvest_pick" ADD COLUMN     "taAtPick" DECIMAL(4,1);

-- Sanity CHECKs (mirror the registry; NULL passes — both fields are optional).
ALTER TABLE "harvest_pick" ADD CONSTRAINT "harvest_pick_phAtPick_range" CHECK ("phAtPick" IS NULL OR ("phAtPick" >= 2.5 AND "phAtPick" <= 4.5));
ALTER TABLE "harvest_pick" ADD CONSTRAINT "harvest_pick_taAtPick_range" CHECK ("taAtPick" IS NULL OR ("taAtPick" >= 0 AND "taAtPick" <= 20));
