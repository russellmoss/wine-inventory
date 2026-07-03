-- Phase 9 Unit 1 — Work Order status/type enums, ISOLATED in their own migration (the Windows enum
-- rule: create the types and commit BEFORE any column defaults to or uses them, so a single failed
-- step can't leave a half-created type wedged against a column). The _work_order_schema migration that
-- follows adds the six tables that reference these. See
-- docs/plans/2026-07-03-032-feat-work-orders-plan.md.

CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED');
CREATE TYPE "WorkOrderTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DONE', 'SKIPPED');
CREATE TYPE "WorkOrderTaskKind" AS ENUM ('OPERATION', 'OBSERVATION');
CREATE TYPE "WorkOrderTaskAttemptStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED');
CREATE TYPE "ReservationKind" AS ENUM ('LOT_VOLUME', 'VESSEL_CAPACITY', 'MATERIAL_QTY');
