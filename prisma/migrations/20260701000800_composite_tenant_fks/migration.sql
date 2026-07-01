-- Phase 12 Unit 5b: recreate the cross-tenant-RISK lineage/ledger FKs as COMPOSITE
-- (tenantId, refId) -> parent(tenantId, id) (K11). FK checks bypass RLS, so a single-column FK
-- would let tenant A reference tenant B's opaque id and get it stamped tenant A -> a permanent
-- cross-tenant edge. Composite FKs make that structurally impossible. MUST run AFTER U5 (NOT NULL):
-- with a nullable tenantId, MATCH SIMPLE would skip the check on null-tenant rows.
--
-- First promote the U4 (tenantId, id) unique INDEXES to CONSTRAINTS — Postgres FKs can only
-- reference a unique CONSTRAINT/PK, not a bare unique index (name is preserved -> no Prisma drift).

SET lock_timeout = '5s';

ALTER TABLE "lot" ADD CONSTRAINT "lot_tenantId_id_key" UNIQUE USING INDEX "lot_tenantId_id_key";
ALTER TABLE "vessel" ADD CONSTRAINT "vessel_tenantId_id_key" UNIQUE USING INDEX "vessel_tenantId_id_key";
ALTER TABLE "vineyard" ADD CONSTRAINT "vineyard_tenantId_id_key" UNIQUE USING INDEX "vineyard_tenantId_id_key";
ALTER TABLE "harvest_pick" ADD CONSTRAINT "harvest_pick_tenantId_id_key" UNIQUE USING INDEX "harvest_pick_tenantId_id_key";
ALTER TABLE "blend_trial" ADD CONSTRAINT "blend_trial_tenantId_id_key" UNIQUE USING INDEX "blend_trial_tenantId_id_key";

-- lot_operation_line -> lot (RESTRICT), -> vessel (SET NULL on vesselId only; tenantId stays)
ALTER TABLE "lot_operation_line" DROP CONSTRAINT "lot_operation_line_lotId_fkey";
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "lot_operation_line" DROP CONSTRAINT "lot_operation_line_vesselId_fkey";
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("vesselId");

-- lot_lineage -> lot x2 (child CASCADE, parent RESTRICT)
ALTER TABLE "lot_lineage" DROP CONSTRAINT "lot_lineage_childLotId_fkey";
ALTER TABLE "lot_lineage" ADD CONSTRAINT "lot_lineage_tenantId_childLotId_fkey" FOREIGN KEY ("tenantId", "childLotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "lot_lineage" DROP CONSTRAINT "lot_lineage_parentLotId_fkey";
ALTER TABLE "lot_lineage" ADD CONSTRAINT "lot_lineage_tenantId_parentLotId_fkey" FOREIGN KEY ("tenantId", "parentLotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- vessel_lot -> vessel (CASCADE), -> lot (RESTRICT)
ALTER TABLE "vessel_lot" DROP CONSTRAINT "vessel_lot_vesselId_fkey";
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "vessel_lot" DROP CONSTRAINT "vessel_lot_lotId_fkey";
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- bottling_source -> lot (SET NULL on lotId only; tenantId stays)
ALTER TABLE "bottling_source" DROP CONSTRAINT "bottling_source_lotId_fkey";
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("lotId");

-- lot_vineyard -> lot (CASCADE), -> vineyard (RESTRICT)
ALTER TABLE "lot_vineyard" DROP CONSTRAINT "lot_vineyard_lotId_fkey";
ALTER TABLE "lot_vineyard" ADD CONSTRAINT "lot_vineyard_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "lot_vineyard" DROP CONSTRAINT "lot_vineyard_vineyardId_fkey";
ALTER TABLE "lot_vineyard" ADD CONSTRAINT "lot_vineyard_tenantId_vineyardId_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- lot_harvest_source -> lot (CASCADE), -> harvest_pick (RESTRICT)
ALTER TABLE "lot_harvest_source" DROP CONSTRAINT "lot_harvest_source_lotId_fkey";
ALTER TABLE "lot_harvest_source" ADD CONSTRAINT "lot_harvest_source_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "lot_harvest_source" DROP CONSTRAINT "lot_harvest_source_harvestPickId_fkey";
ALTER TABLE "lot_harvest_source" ADD CONSTRAINT "lot_harvest_source_tenantId_harvestPickId_fkey" FOREIGN KEY ("tenantId", "harvestPickId") REFERENCES "harvest_pick"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- blend_trial_component -> lot (RESTRICT), -> blend_trial (CASCADE)
ALTER TABLE "blend_trial_component" DROP CONSTRAINT "blend_trial_component_lotId_fkey";
ALTER TABLE "blend_trial_component" ADD CONSTRAINT "blend_trial_component_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "blend_trial_component" DROP CONSTRAINT "blend_trial_component_trialId_fkey";
ALTER TABLE "blend_trial_component" ADD CONSTRAINT "blend_trial_component_tenantId_trialId_fkey" FOREIGN KEY ("tenantId", "trialId") REFERENCES "blend_trial"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
