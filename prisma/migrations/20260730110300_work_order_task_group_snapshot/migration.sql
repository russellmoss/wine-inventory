-- Cellarhand v2 Phase 7 (plan 106, Units 5 + 6) — group IDENTITY on the task, and the member list
-- FROZEN AT ISSUE. This is the migration that makes invariant GROUP-3 implementable.
--
-- WHY THIS EXISTS AT ALL — plan 106 finding F3, the one that resized the phase.
-- ADR 0014 and GROUP-3 both rest on: "a DRAFT work order reads LIVE membership; the snapshot is
-- taken at issue." Against the code, none of that was true. `WorkOrderTask` had NO group reference
-- of any kind, and `resolveGroupMembers` (nl-resolve.ts:156) discarded the group's identity at
-- authoring — the member list was flattened into `plannedPayload.groupRack` / `.groupActivity` as
-- bare id + code arrays. So a draft did not read live membership; it read a list frozen when the
-- DRAFT WAS WRITTEN. "Freezing again at issue" would have changed nothing, and GROUP-3 would have
-- been a green check over a no-op.
--
-- Persisting the group id is therefore the PREREQUISITE, not a nicety: without it there is nothing
-- to re-resolve from, and nothing to snapshot.
--
-- EVERY COLUMN HERE IS NULLABLE, and that is load-bearing (F2). RFC-000 §2 claims "every table these
-- RFCs touch is EMPTY" — false. `work_order_task` holds 106 live rows across 73 work orders. There
-- is no SET NOT NULL anywhere in this file and there must never be one added to it.

ALTER TABLE "work_order_task"
  -- D2. Null means "this task's member list was always a literal list" — a range like B101-B110 or a
  -- comma-separated set. That case needs no snapshot: the payload list IS the frozen list, and it was
  -- frozen at authoring. Correct, and deliberately unchanged.
  ADD COLUMN "vesselGroupId"    TEXT,
  -- D1/F4. The snapshot is a nullable Json column ON THE TASK.
  --
  -- Not on `work_order` (RFC-000 M2 put it there): membership is PER TASK. One work order can carry
  -- several group tasks against different groups — `groupSeq` sequencing exists precisely so several
  -- task groups can run — and a single WorkOrder-level column cannot represent that.
  --
  -- Not a join table: it would be a NEW tenant-scoped table needing all nine Phase-12 steps (RLS,
  -- grants, composite uniques, an isolation test) to store data ADR 0014 explicitly decided does not
  -- need to be queryable. This repo has chosen JSON for member sets twice with a written rationale
  -- (group-activity.ts:6). And a member table drifts toward exactly what GROUP-2 forbids — a second,
  -- parallel ledger of vessels. Accepted cost: not queryable. Already accepted by ADR 0014.
  ADD COLUMN "memberSnapshot"   JSONB,
  -- The freeze timestamp. Non-null IS the "this has been frozen" flag — the write is once-only and
  -- `issueWorkOrderCore` refuses to overwrite a non-null snapshot.
  ADD COLUMN "memberSnapshotAt" TIMESTAMP(3);

-- Phase-12 checklist step 5. ON DELETE SET NULL, and the difference from the previous migration's
-- CASCADE is deliberate: deleting a group must NOT delete work-order history. The work order keeps
-- its frozen member list and simply loses the pointer to a group that no longer exists — which is
-- exactly right, because the snapshot is the record, not the group.
--
-- The `("vesselGroupId")` column list on SET NULL is required, not stylistic: a bare SET NULL nulls
-- EVERY referencing column including "tenantId", which is NOT NULL, so the delete would error.
-- Precedent: lot_operation_line_tenantId_vesselId_fkey (20260701000800_composite_tenant_fks:22).
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_vesselGroupId_fkey"
  FOREIGN KEY ("tenantId", "vesselGroupId") REFERENCES "vessel_group"("tenantId", "id")
  ON UPDATE CASCADE ON DELETE SET NULL ("vesselGroupId");

-- The archive-warning count (countOpenWorkOrdersForGroup) and the group detail page both scan this.
CREATE INDEX "work_order_task_tenantId_vesselGroupId_idx" ON "work_order_task"("tenantId", "vesselGroupId");

-- GROUP-3 as a CHECK: a snapshot and its timestamp are present together or absent together. Without
-- this, "frozen" could be asserted by a row with a member list and no freeze time, or a freeze time
-- and no list — two states the read path would have to guess about. Same posture as the
-- lie_*_projection_honest constraints in 20260728100100_latent_infection_event.
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_snapshot_honest"
  CHECK (("memberSnapshot" IS NULL) = ("memberSnapshotAt" IS NULL));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_task_tenantId_vesselGroupId_fkey') THEN
    RAISE EXCEPTION 'composite tenant FK work_order_task -> vessel_group missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_task_snapshot_honest') THEN
    RAISE EXCEPTION 'GROUP-3 snapshot CHECK missing';
  END IF;
  -- F2 tripwire. work_order_task holds live rows; a NOT NULL on any of these three would fail on
  -- deploy after CI passed.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'work_order_task'
       AND column_name IN ('vesselGroupId', 'memberSnapshot', 'memberSnapshotAt')
       AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'every column this phase adds to work_order_task must stay NULLABLE (plan 106 F2 — 106 live rows)';
  END IF;
END
$$;
