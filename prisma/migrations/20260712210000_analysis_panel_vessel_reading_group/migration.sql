-- Plan 060: fan-out a single vessel reading to all co-resident lots (multi-lot "one must" tank).
-- Additive + nullable; NO backfill — existing rows keep NULL (an ordinary single-lot reading).
-- VISION D2 preserved: every panel still attaches to exactly one lot. This column only GROUPS
-- the N single-lot panels produced by one physical whole-tank reading.

-- AlterTable
ALTER TABLE "analysis_panel" ADD COLUMN "vesselReadingGroupId" TEXT;

-- CreateIndex (vessel-scoped dedup query: coalesce(vesselReadingGroupId, id) per vessel)
CREATE INDEX "analysis_panel_vesselId_vesselReadingGroupId_idx" ON "analysis_panel"("vesselId", "vesselReadingGroupId");

-- CreateIndex
-- One panel per (tenant, group, lot): makes fan-out idempotent (a retry collides -> P2002 -> no-op)
-- and blocks two divergent panels for the same (group, lot). NULL group ids are DISTINCT in a
-- Postgres unique index, so legacy/single-lot rows (null group) never collide -- effectively partial.
CREATE UNIQUE INDEX "analysis_panel_tenantId_vesselReadingGroupId_lotId_key" ON "analysis_panel"("tenantId", "vesselReadingGroupId", "lotId");
