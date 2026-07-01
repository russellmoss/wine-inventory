-- Phase 12 Unit 9: tenantId gets a DEFAULT of '' (empty string). The tenant is set at
-- runtime by the Prisma extension auto-inject (app) or explicitly (ledger/scripts); the default
-- only makes tenantId type-optional at create sites. It is FAIL-SAFE, never a leak: an empty
-- string matches no organization (FK reject) and no app.tenant_id (RLS WITH CHECK reject).

ALTER TABLE "location" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "variety" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vineyard" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vineyard_detail" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vineyard_block" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vineyard_subblock" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "field_note" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "field_input" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "brix_log" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "harvest_record" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "harvest_pick" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vessel" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vessel_component" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vessel_transfer" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "wine_sku" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "bottling_run" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "bottling_source" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "stock_movement" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "bottled_inventory" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "finished_good_category" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "finished_good" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "finished_good_inventory" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "audit_log" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "assistant_confirmation" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "assistant_feedback" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "assistant_conversation" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "assistant_message" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "app_settings" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "press_cycle" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_operation" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_operation_line" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vessel_lot" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_lineage" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_harvest_source" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_state_event" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "bottled_lot_state" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_vineyard" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "user_vineyard" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "blend_trial" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "blend_trial_component" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_treatment" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "cellar_material" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vessel_group" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "vessel_group_member" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "analysis_panel" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "analysis_reading" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "lot_tasting_note" ALTER COLUMN "tenantId" SET DEFAULT '';
ALTER TABLE "sample" ALTER COLUMN "tenantId" SET DEFAULT '';
