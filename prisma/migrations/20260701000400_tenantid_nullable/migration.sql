-- Phase 12 Unit 2: add a NULLABLE tenantId (FK -> organization) + index to every tenant-scoped
-- table (49 tables). Nullable = instant add, no table rewrite. Backfilled in Unit 3, flipped to
-- NOT NULL in Unit 5. FK is ON DELETE RESTRICT (never cascade-delete a whole winery). Index names
-- follow Prisma's <table>_tenantId_idx convention so the schema stays drift-free.

ALTER TABLE "location" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "location_tenantId_idx" ON "location"("tenantId");
ALTER TABLE "location" ADD CONSTRAINT "location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "variety" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "variety_tenantId_idx" ON "variety"("tenantId");
ALTER TABLE "variety" ADD CONSTRAINT "variety_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vineyard" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vineyard_tenantId_idx" ON "vineyard"("tenantId");
ALTER TABLE "vineyard" ADD CONSTRAINT "vineyard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vineyard_detail" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vineyard_detail_tenantId_idx" ON "vineyard_detail"("tenantId");
ALTER TABLE "vineyard_detail" ADD CONSTRAINT "vineyard_detail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vineyard_block" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vineyard_block_tenantId_idx" ON "vineyard_block"("tenantId");
ALTER TABLE "vineyard_block" ADD CONSTRAINT "vineyard_block_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vineyard_subblock" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vineyard_subblock_tenantId_idx" ON "vineyard_subblock"("tenantId");
ALTER TABLE "vineyard_subblock" ADD CONSTRAINT "vineyard_subblock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "field_note" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "field_note_tenantId_idx" ON "field_note"("tenantId");
ALTER TABLE "field_note" ADD CONSTRAINT "field_note_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "field_input" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "field_input_tenantId_idx" ON "field_input"("tenantId");
ALTER TABLE "field_input" ADD CONSTRAINT "field_input_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brix_log" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "brix_log_tenantId_idx" ON "brix_log"("tenantId");
ALTER TABLE "brix_log" ADD CONSTRAINT "brix_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "harvest_record" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "harvest_record_tenantId_idx" ON "harvest_record"("tenantId");
ALTER TABLE "harvest_record" ADD CONSTRAINT "harvest_record_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "harvest_pick" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "harvest_pick_tenantId_idx" ON "harvest_pick"("tenantId");
ALTER TABLE "harvest_pick" ADD CONSTRAINT "harvest_pick_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vessel_tenantId_idx" ON "vessel"("tenantId");
ALTER TABLE "vessel" ADD CONSTRAINT "vessel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel_component" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vessel_component_tenantId_idx" ON "vessel_component"("tenantId");
ALTER TABLE "vessel_component" ADD CONSTRAINT "vessel_component_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel_transfer" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vessel_transfer_tenantId_idx" ON "vessel_transfer"("tenantId");
ALTER TABLE "vessel_transfer" ADD CONSTRAINT "vessel_transfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wine_sku" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "wine_sku_tenantId_idx" ON "wine_sku"("tenantId");
ALTER TABLE "wine_sku" ADD CONSTRAINT "wine_sku_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottling_run" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "bottling_run_tenantId_idx" ON "bottling_run"("tenantId");
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottling_source" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "bottling_source_tenantId_idx" ON "bottling_source"("tenantId");
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movement" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "stock_movement_tenantId_idx" ON "stock_movement"("tenantId");
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottled_inventory" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "bottled_inventory_tenantId_idx" ON "bottled_inventory"("tenantId");
ALTER TABLE "bottled_inventory" ADD CONSTRAINT "bottled_inventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_good_category" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "finished_good_category_tenantId_idx" ON "finished_good_category"("tenantId");
ALTER TABLE "finished_good_category" ADD CONSTRAINT "finished_good_category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_good" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "finished_good_tenantId_idx" ON "finished_good"("tenantId");
ALTER TABLE "finished_good" ADD CONSTRAINT "finished_good_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_good_inventory" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "finished_good_inventory_tenantId_idx" ON "finished_good_inventory"("tenantId");
ALTER TABLE "finished_good_inventory" ADD CONSTRAINT "finished_good_inventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_log" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "audit_log_tenantId_idx" ON "audit_log"("tenantId");
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant_confirmation" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "assistant_confirmation_tenantId_idx" ON "assistant_confirmation"("tenantId");
ALTER TABLE "assistant_confirmation" ADD CONSTRAINT "assistant_confirmation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant_feedback" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "assistant_feedback_tenantId_idx" ON "assistant_feedback"("tenantId");
ALTER TABLE "assistant_feedback" ADD CONSTRAINT "assistant_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant_conversation" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "assistant_conversation_tenantId_idx" ON "assistant_conversation"("tenantId");
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant_message" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "assistant_message_tenantId_idx" ON "assistant_message"("tenantId");
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_settings" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "app_settings_tenantId_idx" ON "app_settings"("tenantId");
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "press_cycle" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "press_cycle_tenantId_idx" ON "press_cycle"("tenantId");
ALTER TABLE "press_cycle" ADD CONSTRAINT "press_cycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_tenantId_idx" ON "lot"("tenantId");
ALTER TABLE "lot" ADD CONSTRAINT "lot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_operation" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_operation_tenantId_idx" ON "lot_operation"("tenantId");
ALTER TABLE "lot_operation" ADD CONSTRAINT "lot_operation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_operation_line" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_operation_line_tenantId_idx" ON "lot_operation_line"("tenantId");
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel_lot" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vessel_lot_tenantId_idx" ON "vessel_lot"("tenantId");
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_lineage" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_lineage_tenantId_idx" ON "lot_lineage"("tenantId");
ALTER TABLE "lot_lineage" ADD CONSTRAINT "lot_lineage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_harvest_source" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_harvest_source_tenantId_idx" ON "lot_harvest_source"("tenantId");
ALTER TABLE "lot_harvest_source" ADD CONSTRAINT "lot_harvest_source_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_state_event" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_state_event_tenantId_idx" ON "lot_state_event"("tenantId");
ALTER TABLE "lot_state_event" ADD CONSTRAINT "lot_state_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottled_lot_state" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "bottled_lot_state_tenantId_idx" ON "bottled_lot_state"("tenantId");
ALTER TABLE "bottled_lot_state" ADD CONSTRAINT "bottled_lot_state_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_vineyard" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_vineyard_tenantId_idx" ON "lot_vineyard"("tenantId");
ALTER TABLE "lot_vineyard" ADD CONSTRAINT "lot_vineyard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_vineyard" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "user_vineyard_tenantId_idx" ON "user_vineyard"("tenantId");
ALTER TABLE "user_vineyard" ADD CONSTRAINT "user_vineyard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "blend_trial" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "blend_trial_tenantId_idx" ON "blend_trial"("tenantId");
ALTER TABLE "blend_trial" ADD CONSTRAINT "blend_trial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "blend_trial_component" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "blend_trial_component_tenantId_idx" ON "blend_trial_component"("tenantId");
ALTER TABLE "blend_trial_component" ADD CONSTRAINT "blend_trial_component_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_treatment" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_treatment_tenantId_idx" ON "lot_treatment"("tenantId");
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cellar_material" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "cellar_material_tenantId_idx" ON "cellar_material"("tenantId");
ALTER TABLE "cellar_material" ADD CONSTRAINT "cellar_material_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel_group" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vessel_group_tenantId_idx" ON "vessel_group"("tenantId");
ALTER TABLE "vessel_group" ADD CONSTRAINT "vessel_group_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vessel_group_member" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "vessel_group_member_tenantId_idx" ON "vessel_group_member"("tenantId");
ALTER TABLE "vessel_group_member" ADD CONSTRAINT "vessel_group_member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "analysis_panel" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "analysis_panel_tenantId_idx" ON "analysis_panel"("tenantId");
ALTER TABLE "analysis_panel" ADD CONSTRAINT "analysis_panel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "analysis_reading" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "analysis_reading_tenantId_idx" ON "analysis_reading"("tenantId");
ALTER TABLE "analysis_reading" ADD CONSTRAINT "analysis_reading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lot_tasting_note" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "lot_tasting_note_tenantId_idx" ON "lot_tasting_note"("tenantId");
ALTER TABLE "lot_tasting_note" ADD CONSTRAINT "lot_tasting_note_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sample" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "sample_tenantId_idx" ON "sample"("tenantId");
ALTER TABLE "sample" ADD CONSTRAINT "sample_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

