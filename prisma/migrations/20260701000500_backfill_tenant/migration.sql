-- Phase 12 Unit 3: backfill tenantId = Bhutan (tenant #1) on every existing row. Idempotent
-- (WHERE "tenantId" IS NULL) so a re-run is a no-op. Single-tenant today, so a plain UPDATE per
-- table is safe (all rows -> one org that already exists). A self-verifying DO block at the end
-- RAISES (failing the migration) if ANY tenant table still has a NULL tenantId.

UPDATE "location" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "variety" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vineyard" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vineyard_detail" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vineyard_block" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vineyard_subblock" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "field_note" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "field_input" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "brix_log" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "harvest_record" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "harvest_pick" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vessel" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vessel_component" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vessel_transfer" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "wine_sku" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "bottling_run" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "bottling_source" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "stock_movement" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "bottled_inventory" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "finished_good_category" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "finished_good" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "finished_good_inventory" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "audit_log" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "assistant_confirmation" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "assistant_feedback" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "assistant_conversation" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "assistant_message" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "app_settings" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "press_cycle" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_operation" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_operation_line" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vessel_lot" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_lineage" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_harvest_source" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_state_event" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "bottled_lot_state" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_vineyard" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "user_vineyard" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "blend_trial" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "blend_trial_component" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_treatment" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "cellar_material" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vessel_group" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "vessel_group_member" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "analysis_panel" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "analysis_reading" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "lot_tasting_note" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;
UPDATE "sample" SET "tenantId" = 'org_bhutan_wine_co' WHERE "tenantId" IS NULL;

-- Self-verify: fail the migration if any tenant table still has a NULL tenantId.
DO $$
DECLARE r TEXT; n BIGINT;
BEGIN
  FOREACH r IN ARRAY ARRAY['location', 'variety', 'vineyard', 'vineyard_detail', 'vineyard_block', 'vineyard_subblock', 'field_note', 'field_input', 'brix_log', 'harvest_record', 'harvest_pick', 'vessel', 'vessel_component', 'vessel_transfer', 'wine_sku', 'bottling_run', 'bottling_source', 'stock_movement', 'bottled_inventory', 'finished_good_category', 'finished_good', 'finished_good_inventory', 'audit_log', 'assistant_confirmation', 'assistant_feedback', 'assistant_conversation', 'assistant_message', 'app_settings', 'press_cycle', 'lot', 'lot_operation', 'lot_operation_line', 'vessel_lot', 'lot_lineage', 'lot_harvest_source', 'lot_state_event', 'bottled_lot_state', 'lot_vineyard', 'user_vineyard', 'blend_trial', 'blend_trial_component', 'lot_treatment', 'cellar_material', 'vessel_group', 'vessel_group_member', 'analysis_panel', 'analysis_reading', 'lot_tasting_note', 'sample'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "tenantId" IS NULL', r) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'U3 backfill incomplete: % row(s) with NULL tenantId in %', n, r;
    END IF;
  END LOOP;
END $$;
