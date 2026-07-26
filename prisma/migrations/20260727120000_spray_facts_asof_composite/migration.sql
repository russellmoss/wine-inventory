-- S3a ↔ S2 seam fix: the facts-as-of watermark is a COMPOSITE, not a scalar.
--
-- Found 2026-07-26 auditing the four shipped Wave-1 lanes against each other. S2 froze
-- `PesticideFactsAsOf` = { publishedRevisionId: string(cuid), apprilAsOf, cdprAsOf,
-- resistanceArtifactSha256 } (docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md); S3a shipped
-- `factsRevision Int?` + a scalar `factsAsOf`. Two defects: a cuid cannot be written into an Int
-- column at all, and a scalar collapses four independently-moving source dates — the exact collapse
-- S2's contract forbids ("a scalar would imply they all moved together — they do not").
--
-- Done NOW because `spray_material_line` holds ZERO rows (verified before writing this): additive
-- widening today vs backfill-then-enforce on a live regulatory table once S2b starts resolving real
-- facts. `factsRevision` is DROPPED rather than left in place — a misleading Int watermark sitting
-- beside the real composite is an invitation to write the wrong thing.
--
-- `factsAsOf` SURVIVES, narrowed in meaning: display/staleness convenience = the newest non-null
-- component. Engines compare the component that matters to their question, never this.

ALTER TABLE "spray_material_line" ADD COLUMN "factsPublishedRevisionId" TEXT;
ALTER TABLE "spray_material_line" ADD COLUMN "factsApprilAsOf" TIMESTAMP(3);
ALTER TABLE "spray_material_line" ADD COLUMN "factsCdprAsOf" TIMESTAMP(3);
ALTER TABLE "spray_material_line" ADD COLUMN "factsResistanceArtifactSha256" TEXT;

-- Safety: refuse to drop the old column if anything ever DID land in it (a non-empty table means
-- this migration is running somewhere the assumption above does not hold — stop and backfill).
DO $$
DECLARE
  populated bigint;
BEGIN
  SELECT count(*) INTO populated FROM "spray_material_line" WHERE "factsRevision" IS NOT NULL;
  IF populated > 0 THEN
    RAISE EXCEPTION 'spray_material_line has % row(s) with a non-null factsRevision — this migration assumes zero. Backfill factsPublishedRevisionId from S2 first, then drop.', populated;
  END IF;
END
$$;

ALTER TABLE "spray_material_line" DROP COLUMN "factsRevision";

-- The provenance read path S9 will use ("which sprays predate the November APPRIL refresh?").
CREATE INDEX "spray_material_line_tenantId_factsApprilAsOf_idx" ON "spray_material_line"("tenantId", "factsApprilAsOf");

-- The append-only trigger is column-agnostic (it diffs to_jsonb(OLD) vs to_jsonb(NEW) against a
-- per-table allowlist), so the new columns are immutable content by default — no trigger change
-- needed, and none wanted: a facts snapshot must never be updated in place (SPRAY-2).
