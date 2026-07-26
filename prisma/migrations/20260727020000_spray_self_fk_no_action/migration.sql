-- S3a follow-up: the two supersession self-FKs were ON DELETE RESTRICT, which is checked
-- IMMEDIATELY per row — a corrected chain (predecessor ↔ successor point at each other) became
-- mutually undeletable, so even the sanctioned owner-context QA purge (app.allow_spray_purge,
-- council C15) could never remove its fixtures. NO ACTION keeps the exact same protection for
-- ordinary deletes (an orphaning delete still fails) but is checked at END OF STATEMENT, so a
-- single DELETE removing the whole chain succeeds. The append-only DELETE trigger remains the
-- real gate; this only unblocks the sanctioned teardown path.

ALTER TABLE "spray_application" DROP CONSTRAINT "spray_application_supersedes_fkey";
ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_supersedes_fkey"
  FOREIGN KEY ("tenantId", "supersedesApplicationId") REFERENCES "spray_application"("tenantId", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "spray_application" DROP CONSTRAINT "spray_application_supersededBy_fkey";
ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_supersededBy_fkey"
  FOREIGN KEY ("tenantId", "supersededByApplicationId") REFERENCES "spray_application"("tenantId", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
