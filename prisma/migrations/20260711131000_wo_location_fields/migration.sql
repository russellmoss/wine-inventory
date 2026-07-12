-- Plan 053 B9: classify locations + let work orders/tasks reference where the work happens.
-- Additive + nullable. Location.kind is a validated string (no enum). locationId is a plain ref to
-- location.id resolved at runtime (K11/K12 — no composite relation), tenant-safe via the app extension.
-- Existing location rows are left unclassified (kind NULL) rather than guessing their type.
ALTER TABLE "location" ADD COLUMN "kind" TEXT;
ALTER TABLE "work_order" ADD COLUMN "locationId" TEXT;
ALTER TABLE "work_order_task" ADD COLUMN "locationId" TEXT;
