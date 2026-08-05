-- Denormalised `vineyardId` can no longer drift from its parent's vineyard.
--
-- THE PROBLEM. `block_spatial_metric`, `block_soil_snapshot` and `spatial_dataset_derivative` each carry
-- a `vineyardId` that is a COPY of their parent's vineyard, denormalised "for per-vineyard reads (plain
-- indexed column, no FK — avoids a redundant cascade path)". The cascade concern was legitimate, but the
-- copy was unconstrained, so nothing stopped it from disagreeing with the parent. A per-vineyard NDVI or
-- soil read filters on that column, so a drifted row silently appears under the WRONG vineyard — or
-- vanishes from the right one. That is a reporting-correctness bug, not just an untidy schema.
--
-- THE FIX, and why it costs no extra cascade path. Rather than ADD a foreign key on `vineyardId` (which
-- would introduce the redundant path the original comment rightly avoided), WIDEN the existing parent
-- key to carry the vineyard: `(tenantId, blockId) -> vineyard_block(tenantId, id)` becomes
-- `(tenantId, blockId, vineyardId) -> vineyard_block(tenantId, id, vineyardId)`. Same number of
-- constraints, same cascade topology, but the copy is now part of the reference itself — so a value that
-- disagrees with the parent cannot be stored at all. Drift becomes unrepresentable rather than merely
-- discouraged.
--
-- BACKFILL-THEN-ENFORCE (AGENTS.md rule for a live tenant). Repair precedes enforcement, and the repair
-- is deterministic rather than a guess: the PARENT is the authority for its own vineyard, so any drifted
-- child is corrected to the parent's value. Zero rows is the expected case; this is the safety net.
--
-- DELIBERATELY NOT DONE HERE: `block_spatial_metric` also references `spatial_dataset`, so its block and
-- its dataset could still name different vineyards. Anchoring that FK too would close it, but the repair
-- would be AMBIGUOUS (block or dataset — which one wins?), so it needs a look at real data first. Left
-- as a separate finding rather than guessed at.

-- 1. FK anchors: the referenced columns must be covered by a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "vineyard_block_tenant_id_vineyard_key"
  ON "vineyard_block" ("tenantId", "id", "vineyardId");
CREATE UNIQUE INDEX IF NOT EXISTS "spatial_dataset_tenant_id_vineyard_key"
  ON "spatial_dataset" ("tenantId", "id", "vineyardId");

-- 2. Repair any existing drift to the parent's value (deterministic; expected to affect 0 rows).
UPDATE "block_spatial_metric" m
   SET "vineyardId" = b."vineyardId"
  FROM "vineyard_block" b
 WHERE b."tenantId" = m."tenantId"
   AND b."id" = m."blockId"
   AND m."vineyardId" <> b."vineyardId";

UPDATE "block_soil_snapshot" s
   SET "vineyardId" = b."vineyardId"
  FROM "vineyard_block" b
 WHERE b."tenantId" = s."tenantId"
   AND b."id" = s."blockId"
   AND s."vineyardId" <> b."vineyardId";

UPDATE "spatial_dataset_derivative" d
   SET "vineyardId" = ds."vineyardId"
  FROM "spatial_dataset" ds
 WHERE ds."tenantId" = d."tenantId"
   AND ds."id" = d."datasetId"
   AND d."vineyardId" <> ds."vineyardId";

-- 3. Widen each parent key to include the vineyard. ON DELETE/UPDATE CASCADE preserved exactly.
ALTER TABLE "block_spatial_metric" DROP CONSTRAINT IF EXISTS "block_spatial_metric_block_fkey";
ALTER TABLE "block_spatial_metric" ADD CONSTRAINT "block_spatial_metric_block_fkey"
  FOREIGN KEY ("tenantId", "blockId", "vineyardId")
  REFERENCES "vineyard_block" ("tenantId", "id", "vineyardId")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "block_soil_snapshot" DROP CONSTRAINT IF EXISTS "block_soil_snapshot_block_fkey";
ALTER TABLE "block_soil_snapshot" ADD CONSTRAINT "block_soil_snapshot_block_fkey"
  FOREIGN KEY ("tenantId", "blockId", "vineyardId")
  REFERENCES "vineyard_block" ("tenantId", "id", "vineyardId")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "spatial_dataset_derivative" DROP CONSTRAINT IF EXISTS "spatial_dataset_derivative_dataset_fkey";
ALTER TABLE "spatial_dataset_derivative" ADD CONSTRAINT "spatial_dataset_derivative_dataset_fkey"
  FOREIGN KEY ("tenantId", "datasetId", "vineyardId")
  REFERENCES "spatial_dataset" ("tenantId", "id", "vineyardId")
  ON UPDATE CASCADE ON DELETE CASCADE;
