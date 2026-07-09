-- Phase 3 generic migration kernel - enum-only migration (Windows enum rule).
-- OPENING_BALANCE is committed before schema/code writes CostLine rows with this component.
--
-- ROLLBACK: Postgres cannot drop enum values in place. Restore from a point before this migration if
-- the label must be removed; it is inert unless rows use it.

ALTER TYPE "CostComponent" ADD VALUE IF NOT EXISTS 'OPENING_BALANCE';
