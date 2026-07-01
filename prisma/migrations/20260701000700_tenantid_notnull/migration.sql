-- Phase 12 Unit 5: make tenantId NOT NULL on every tenant table (structural boundary).
-- U3 backfilled all rows, so SET NOT NULL cannot fail. Plain SET NOT NULL (not the PG<18
-- CHECK-NOT-VALID/VALIDATE dance): tiny single-tenant data + controlled window means the
-- lock-avoidance dance buys nothing; the resulting constraint is identical.

ALTER TABLE "location" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "variety" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vineyard" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vineyard_detail" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vineyard_block" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vineyard_subblock" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "field_note" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "field_input" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "brix_log" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "harvest_record" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "harvest_pick" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vessel" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vessel_component" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vessel_transfer" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "wine_sku" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "bottling_run" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "bottling_source" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "stock_movement" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "bottled_inventory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "finished_good_category" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "finished_good" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "finished_good_inventory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "audit_log" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "assistant_confirmation" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "assistant_feedback" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "assistant_conversation" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "assistant_message" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "app_settings" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "press_cycle" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_operation" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_operation_line" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vessel_lot" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_lineage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_harvest_source" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_state_event" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "bottled_lot_state" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_vineyard" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "user_vineyard" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "blend_trial" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "blend_trial_component" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_treatment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "cellar_material" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vessel_group" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "vessel_group_member" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "analysis_panel" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "analysis_reading" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lot_tasting_note" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "sample" ALTER COLUMN "tenantId" SET NOT NULL;
