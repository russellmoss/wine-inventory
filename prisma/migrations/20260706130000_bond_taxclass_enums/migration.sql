-- Phase 2 (Bond + tax-class) — ENUM-ONLY migration (Windows enum rule). Postgres `ALTER TYPE ... ADD
-- VALUE` cannot be USED in the same transaction that adds it, so these new values commit HERE, before
-- the sibling _bond_taxclass_schema / _bond_taxclass_backfill migrations and before any core writes
-- them (transfer-in-bond-core.ts / return-to-bond-core.ts / the AMEND-1 cascade). CHANGE_OWNERSHIP is
-- DEFERRED (Phase-2 OQ-1) and intentionally NOT added.
--
-- ROLLBACK (Prisma has no down-migrations): Postgres cannot DROP an enum value in place. To roll back,
-- restore the database from a point before this migration (the added labels are otherwise inert until
-- a row uses them, which only the _schema + core code do).

-- OperationType: cross-bond movement + refund-flagged re-admission (BOND-1 / TAXPAID-1).
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN_BOND';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'RETURN_TO_BOND';

-- ComplianceReportStatus: a FILED period reopened by a later-dated op (AMEND-1).
ALTER TYPE "ComplianceReportStatus" ADD VALUE IF NOT EXISTS 'NEEDS_AMENDMENT';
