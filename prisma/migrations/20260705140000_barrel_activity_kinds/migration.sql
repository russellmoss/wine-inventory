-- Plan 044 — barrel-maintenance activity kinds, ISOLATED (the Windows enum rule): add the three new
-- VesselActivityKind values and COMMIT them before any code writes them. Postgres forbids USING a
-- freshly-added enum value in the same transaction it was added; none are used here. IF NOT EXISTS makes
-- each ADD VALUE idempotent (safe re-run).

ALTER TYPE "VesselActivityKind" ADD VALUE IF NOT EXISTS 'OZONE';
ALTER TYPE "VesselActivityKind" ADD VALUE IF NOT EXISTS 'SO2';
ALTER TYPE "VesselActivityKind" ADD VALUE IF NOT EXISTS 'WET_STORAGE';
