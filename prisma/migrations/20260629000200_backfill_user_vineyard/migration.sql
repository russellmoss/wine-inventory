-- Phase 5 (D9) data migration: backfill the UserVineyard MEMBERSHIP set from the existing
-- single User.assignedVineyardId — one row per assigned manager. Idempotent. This runs
-- BEFORE the column drop (a separate later migration) so a backfill bug can't ride with the
-- irreversible drop (council S3 / eng-review P2). assignedVineyardId is left in place (dual-read).
INSERT INTO "user_vineyard" ("id", "userId", "vineyardId", "createdAt")
SELECT gen_random_uuid()::text, u."id", u."assignedVineyardId", CURRENT_TIMESTAMP
FROM "user" u
WHERE u."assignedVineyardId" IS NOT NULL
ON CONFLICT ("userId", "vineyardId") DO NOTHING;
