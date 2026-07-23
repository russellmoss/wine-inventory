-- Plan 093 (custom-crush data foundation), Unit 2: nullable ownerId on the 20 owner-scope tables.
-- EXPAND step (expand/migrate/contract). Purely additive: ADD COLUMN (nullable, no default -> metadata-only,
-- no table rewrite), a (tenantId, ownerId) index, and a composite FK -> owner(tenantId, id) (K11, raw-SQL,
-- MATCH SIMPLE: a NULL ownerId = Estate/facility skips the FK; a set ownerId must reference a real owner).
-- No backfill: ESTATE maps to ownerId NULL, so every existing (estate) row is already correct at NULL.
-- The 5 non-ledger tables (BlendTrialComponent, ChangeOfTaxClassEvent, LotCostState, WorkOrderTask,
-- Reservation) stay tenant-only (plan review Q1); plan 092 adds ownerId there only if it fences them.

ALTER TABLE "lot" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_tenantId_ownerId_idx" ON "lot"("tenantId", "ownerId");
ALTER TABLE "lot" ADD CONSTRAINT "lot_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_operation_line" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_operation_line_tenantId_ownerId_idx" ON "lot_operation_line"("tenantId", "ownerId");
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel_lot" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "vessel_lot_tenantId_ownerId_idx" ON "vessel_lot"("tenantId", "ownerId");
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_harvest_source" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_harvest_source_tenantId_ownerId_idx" ON "lot_harvest_source"("tenantId", "ownerId");
ALTER TABLE "lot_harvest_source" ADD CONSTRAINT "lot_harvest_source_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_state_event" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_state_event_tenantId_ownerId_idx" ON "lot_state_event"("tenantId", "ownerId");
ALTER TABLE "lot_state_event" ADD CONSTRAINT "lot_state_event_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottled_lot_state" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "bottled_lot_state_tenantId_ownerId_idx" ON "bottled_lot_state"("tenantId", "ownerId");
ALTER TABLE "bottled_lot_state" ADD CONSTRAINT "bottled_lot_state_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_vineyard" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_vineyard_tenantId_ownerId_idx" ON "lot_vineyard"("tenantId", "ownerId");
ALTER TABLE "lot_vineyard" ADD CONSTRAINT "lot_vineyard_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_treatment" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_treatment_tenantId_ownerId_idx" ON "lot_treatment"("tenantId", "ownerId");
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_line" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "cost_line_tenantId_ownerId_idx" ON "cost_line"("tenantId", "ownerId");
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "barrel_fill" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "barrel_fill_tenantId_ownerId_idx" ON "barrel_fill"("tenantId", "ownerId");
ALTER TABLE "barrel_fill" ADD CONSTRAINT "barrel_fill_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wine_sku" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "wine_sku_tenantId_ownerId_idx" ON "wine_sku"("tenantId", "ownerId");
ALTER TABLE "wine_sku" ADD CONSTRAINT "wine_sku_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottled_inventory" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "bottled_inventory_tenantId_ownerId_idx" ON "bottled_inventory"("tenantId", "ownerId");
ALTER TABLE "bottled_inventory" ADD CONSTRAINT "bottled_inventory_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottling_source" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "bottling_source_tenantId_ownerId_idx" ON "bottling_source"("tenantId", "ownerId");
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movement" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "stock_movement_tenantId_ownerId_idx" ON "stock_movement"("tenantId", "ownerId");
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottling_run" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "bottling_run_tenantId_ownerId_idx" ON "bottling_run"("tenantId", "ownerId");
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "analysis_panel" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "analysis_panel_tenantId_ownerId_idx" ON "analysis_panel"("tenantId", "ownerId");
ALTER TABLE "analysis_panel" ADD CONSTRAINT "analysis_panel_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sample" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "sample_tenantId_ownerId_idx" ON "sample"("tenantId", "ownerId");
ALTER TABLE "sample" ADD CONSTRAINT "sample_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_tasting_note" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_tasting_note_tenantId_ownerId_idx" ON "lot_tasting_note"("tenantId", "ownerId");
ALTER TABLE "lot_tasting_note" ADD CONSTRAINT "lot_tasting_note_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_identifier" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_identifier_tenantId_ownerId_idx" ON "lot_identifier"("tenantId", "ownerId");
ALTER TABLE "lot_identifier" ADD CONSTRAINT "lot_identifier_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_code_event" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "lot_code_event_tenantId_ownerId_idx" ON "lot_code_event"("tenantId", "ownerId");
ALTER TABLE "lot_code_event" ADD CONSTRAINT "lot_code_event_owner_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "owner"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

