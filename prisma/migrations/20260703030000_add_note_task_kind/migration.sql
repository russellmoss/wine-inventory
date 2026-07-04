-- Plan 034 Unit 1 — add the NOTE value to WorkOrderTaskKind, ISOLATED (the Windows enum rule).
-- Postgres forbids USING a freshly-added enum value in the same transaction it was added, so this
-- migration adds the value and NOTHING that references it; the code + any NOTE-bearing rows land in
-- later commits. IF NOT EXISTS makes the ADD VALUE idempotent (safe re-run).
-- NOTE is the free-text checklist/note lane: a checkable task line that completes straight to DONE and
-- writes nothing (no LotOperation, no measurement, no VesselActivityEvent, no CostLine).

ALTER TYPE "WorkOrderTaskKind" ADD VALUE IF NOT EXISTS 'NOTE';
