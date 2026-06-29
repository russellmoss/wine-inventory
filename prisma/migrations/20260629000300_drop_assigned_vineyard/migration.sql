-- Phase 5 (D9): drop the now-redundant single-vineyard column. Runs as a SEPARATE migration
-- AFTER the UserVineyard backfill (20260629000200) is verified, so a backfill bug can't ride
-- with this irreversible drop (council S3 / eng-review P2). Dual-read window ends here.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_assignedVineyardId_fkey";
DROP INDEX IF EXISTS "user_assignedVineyardId_idx";
ALTER TABLE "user" DROP COLUMN IF EXISTS "assignedVineyardId";
