-- Plan 053 B8: ERP planning fields on work orders + tasks (data capture only; no auto-scheduling).
-- All additive + nullable — existing rows are unaffected. priority is a validated string (no enum).
ALTER TABLE "work_order"
  ADD COLUMN "priority" TEXT,
  ADD COLUMN "estimatedDurationMin" INTEGER,
  ADD COLUMN "scheduledStart" TIMESTAMP(3),
  ADD COLUMN "scheduledEnd" TIMESTAMP(3);

ALTER TABLE "work_order_task"
  ADD COLUMN "priority" TEXT,
  ADD COLUMN "estimatedDurationMin" INTEGER,
  ADD COLUMN "scheduledStart" TIMESTAMP(3),
  ADD COLUMN "scheduledEnd" TIMESTAMP(3);
