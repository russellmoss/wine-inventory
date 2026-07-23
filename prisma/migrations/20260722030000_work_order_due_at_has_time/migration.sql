-- Ticket cmrwkmapf: a work order can be requested for a date AND a time of day
-- ("tomorrow at 9am"), not just a date.
--
-- `work_order."dueAt"` was already `timestamp`, but every write path fed it a date-only
-- value, so the clock time was unrepresentable. The instant alone cannot distinguish
-- "the 23rd" from "the 23rd at midnight" — and midnight work IS real during harvest, so
-- it cannot be inferred from the value. This column records the requested PRECISION so
-- the UI shows a time only when one was actually asked for.
--
-- Additive and backward compatible: NOT NULL with a `false` default, which is exactly
-- right for every existing row (all of them were date-only). Code that ignores the
-- column keeps working unchanged, so this migration is safe to apply ahead of the deploy.
--
-- No new table, so the Phase-12 RLS checklist does not apply — `work_order` already has
-- tenantId + FK + FORCE ROW LEVEL SECURITY, and the tenant_isolation policy is row-level,
-- so it covers new columns automatically.

-- AlterTable
ALTER TABLE "work_order" ADD COLUMN "dueAtHasTime" BOOLEAN NOT NULL DEFAULT false;
