-- Phase 9.1 Unit 3 — vessel-activity enums, ISOLATED (the Windows enum rule): create the new
-- VesselActivityKind type AND add the MAINTENANCE value to the existing WorkOrderTaskKind, and COMMIT
-- them before any table/column uses them (the _schema migration that follows references both). Postgres
-- forbids USING a freshly-added enum value in the same transaction it was added; neither value is used
-- here. IF NOT EXISTS makes the ADD VALUE idempotent (safe re-run).

CREATE TYPE "VesselActivityKind" AS ENUM ('TEMP_SETPOINT', 'CLEAN', 'SANITIZE', 'STEAM', 'GAS', 'OTHER');

ALTER TYPE "WorkOrderTaskKind" ADD VALUE IF NOT EXISTS 'MAINTENANCE';
