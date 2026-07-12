-- Plan 053 A3: sequential-group index on work-order tasks.
-- Additive + backward-compatible: every existing row defaults to group 0 (a single group, ungated),
-- which exactly matches pre-053 behavior. The palette builder sets explicit groups; a task may complete
-- only once every task in a LOWER group is worker-completed (enforced in assertTaskDependenciesReady).
ALTER TABLE "work_order_task" ADD COLUMN "groupSeq" INTEGER NOT NULL DEFAULT 0;
