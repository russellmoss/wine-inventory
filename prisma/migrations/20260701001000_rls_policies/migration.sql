-- Phase 12 Unit 7: Row-Level Security on every tenant-scoped table (all 49, INCLUDING the
-- projections vessel_lot / bottled_lot_state and legacy vessel_component). ENABLE + FORCE, and a
-- single policy with BOTH USING (reads/updates/deletes) and WITH CHECK (inserts/updates) keyed on
-- the transaction-scoped GUC app.tenant_id. FAIL-CLOSED: current_setting('app.tenant_id', true)
-- returns NULL when unset -> ("tenantId" = NULL) is NULL (never true) -> zero rows / rejected.
-- The app connects as app_rls (NOBYPASSRLS); the owner (BYPASSRLS) still bypasses, so migrations
-- and the pre-activation live app are unaffected. A checklist DO block at the end FAILS this
-- migration if any listed table lacks ENABLE+FORCE (a projection with no policy is a silent leak).

ALTER TABLE "location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "location" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "variety" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "variety" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "variety" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vineyard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vineyard_detail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_detail" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_detail" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vineyard_block" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_block" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_block" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vineyard_subblock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vineyard_subblock" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vineyard_subblock" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "field_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "field_note" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "field_input" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_input" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "field_input" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "brix_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brix_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "brix_log" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "harvest_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "harvest_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "harvest_record" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "harvest_pick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "harvest_pick" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "harvest_pick" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel_component" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_component" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_component" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel_transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_transfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_transfer" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "wine_sku" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wine_sku" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wine_sku" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "bottling_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bottling_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bottling_run" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "bottling_source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bottling_source" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bottling_source" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "stock_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_movement" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "bottled_inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bottled_inventory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bottled_inventory" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "finished_good_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finished_good_category" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "finished_good_category" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "finished_good" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finished_good" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "finished_good" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "finished_good_inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finished_good_inventory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "finished_good_inventory" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_log" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "assistant_confirmation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_confirmation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assistant_confirmation" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "assistant_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_feedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assistant_feedback" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "assistant_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_conversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assistant_conversation" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "assistant_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assistant_message" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "app_settings" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "press_cycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "press_cycle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "press_cycle" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_operation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_operation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_operation" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_operation_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_operation_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_operation_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel_lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_lot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_lot" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_lineage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_lineage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_lineage" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_harvest_source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_harvest_source" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_harvest_source" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_state_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_state_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_state_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "bottled_lot_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bottled_lot_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bottled_lot_state" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_vineyard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_vineyard" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_vineyard" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "user_vineyard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_vineyard" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_vineyard" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "blend_trial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blend_trial" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "blend_trial" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "blend_trial_component" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blend_trial_component" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "blend_trial_component" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_treatment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_treatment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_treatment" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "cellar_material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cellar_material" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cellar_material" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel_group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_group" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_group" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vessel_group_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vessel_group_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vessel_group_member" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "analysis_panel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_panel" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "analysis_panel" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "analysis_reading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_reading" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "analysis_reading" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_tasting_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_tasting_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_tasting_note" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "sample" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sample" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sample" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Checklist: every tenant table MUST have RLS enabled + forced. Fail the migration otherwise.
DO $$
DECLARE r TEXT; en BOOLEAN; fo BOOLEAN;
BEGIN
  FOREACH r IN ARRAY ARRAY['location', 'variety', 'vineyard', 'vineyard_detail', 'vineyard_block', 'vineyard_subblock', 'field_note', 'field_input', 'brix_log', 'harvest_record', 'harvest_pick', 'vessel', 'vessel_component', 'vessel_transfer', 'wine_sku', 'bottling_run', 'bottling_source', 'stock_movement', 'bottled_inventory', 'finished_good_category', 'finished_good', 'finished_good_inventory', 'audit_log', 'assistant_confirmation', 'assistant_feedback', 'assistant_conversation', 'assistant_message', 'app_settings', 'press_cycle', 'lot', 'lot_operation', 'lot_operation_line', 'vessel_lot', 'lot_lineage', 'lot_harvest_source', 'lot_state_event', 'bottled_lot_state', 'lot_vineyard', 'user_vineyard', 'blend_trial', 'blend_trial_component', 'lot_treatment', 'cellar_material', 'vessel_group', 'vessel_group_member', 'analysis_panel', 'analysis_reading', 'lot_tasting_note', 'sample'] LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity INTO en, fo
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = r;
    IF en IS DISTINCT FROM TRUE OR fo IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'RLS not fully enabled on %: enabled=%, forced=%', r, en, fo;
    END IF;
  END LOOP;
END $$;
