-- Phase 12 Unit 4: flip every global unique to a per-tenant composite, and add the
-- composite (tenantId, id) uniques the U5b cross-tenant FKs reference. Plain (non-concurrent)
-- CREATE UNIQUE INDEX in a guarded txn: single-tenant Bhutan + controlled window, so CONCURRENTLY
-- (the plan's zero-lock variant) buys nothing here; uniqueness/correctness is identical. New index
-- names follow Prisma's <table>_<cols>_key convention so the schema stays drift-free.

SET lock_timeout = '5s';

-- ── Per-tenant unique flips (create composite, drop old global unique) ──
CREATE UNIQUE INDEX "location_tenantId_name_key" ON "location"("tenantId", "name");
DROP INDEX "location_name_key";
CREATE UNIQUE INDEX "variety_tenantId_name_key" ON "variety"("tenantId", "name");
DROP INDEX "variety_name_key";
CREATE UNIQUE INDEX "variety_tenantId_abbreviation_key" ON "variety"("tenantId", "abbreviation");
DROP INDEX "variety_abbreviation_key";
CREATE UNIQUE INDEX "vineyard_tenantId_name_key" ON "vineyard"("tenantId", "name");
DROP INDEX "vineyard_name_key";
CREATE UNIQUE INDEX "vineyard_tenantId_abbreviation_key" ON "vineyard"("tenantId", "abbreviation");
DROP INDEX "vineyard_abbreviation_key";
CREATE UNIQUE INDEX "finished_good_category_tenantId_name_key" ON "finished_good_category"("tenantId", "name");
DROP INDEX "finished_good_category_name_key";
CREATE UNIQUE INDEX "vessel_group_tenantId_name_key" ON "vessel_group"("tenantId", "name");
DROP INDEX "vessel_group_name_key";
CREATE UNIQUE INDEX "press_cycle_tenantId_name_key" ON "press_cycle"("tenantId", "name");
DROP INDEX "press_cycle_name_key";
CREATE UNIQUE INDEX "lot_tenantId_code_key" ON "lot"("tenantId", "code");
DROP INDEX "lot_code_key";
CREATE UNIQUE INDEX "vineyard_subblock_tenantId_blockId_code_key" ON "vineyard_subblock"("tenantId", "blockId", "code");
DROP INDEX "vineyard_subblock_blockId_code_key";
CREATE UNIQUE INDEX "field_note_tenantId_vineyardId_weekOf_key" ON "field_note"("tenantId", "vineyardId", "weekOf");
DROP INDEX "field_note_vineyardId_weekOf_key";
CREATE UNIQUE INDEX "field_input_tenantId_type_normalizedKey_key" ON "field_input"("tenantId", "type", "normalizedKey");
DROP INDEX "field_input_type_normalizedKey_key";
CREATE UNIQUE INDEX "harvest_record_tenantId_blockId_vintageYear_key" ON "harvest_record"("tenantId", "blockId", "vintageYear");
DROP INDEX "harvest_record_blockId_vintageYear_key";
CREATE UNIQUE INDEX "vessel_tenantId_type_code_key" ON "vessel"("tenantId", "type", "code");
DROP INDEX "vessel_type_code_key";
CREATE UNIQUE INDEX "vessel_component_tenantId_vesselId_varietyId_vineyardId_vintage_key" ON "vessel_component"("tenantId", "vesselId", "varietyId", "vineyardId", "vintage");
DROP INDEX "vessel_component_vesselId_varietyId_vineyardId_vintage_key";
CREATE UNIQUE INDEX "bottled_inventory_tenantId_wineSkuId_locationId_key" ON "bottled_inventory"("tenantId", "wineSkuId", "locationId");
DROP INDEX "bottled_inventory_wineSkuId_locationId_key";
CREATE UNIQUE INDEX "finished_good_inventory_tenantId_finishedGoodId_locationId_key" ON "finished_good_inventory"("tenantId", "finishedGoodId", "locationId");
DROP INDEX "finished_good_inventory_finishedGoodId_locationId_key";
CREATE UNIQUE INDEX "vessel_lot_tenantId_vesselId_lotId_key" ON "vessel_lot"("tenantId", "vesselId", "lotId");
DROP INDEX "vessel_lot_vesselId_lotId_key";
CREATE UNIQUE INDEX "lot_vineyard_tenantId_lotId_vineyardId_key" ON "lot_vineyard"("tenantId", "lotId", "vineyardId");
DROP INDEX "lot_vineyard_lotId_vineyardId_key";
CREATE UNIQUE INDEX "user_vineyard_tenantId_userId_vineyardId_key" ON "user_vineyard"("tenantId", "userId", "vineyardId");
DROP INDEX "user_vineyard_userId_vineyardId_key";
CREATE UNIQUE INDEX "blend_trial_component_tenantId_trialId_lotId_key" ON "blend_trial_component"("tenantId", "trialId", "lotId");
DROP INDEX "blend_trial_component_trialId_lotId_key";
CREATE UNIQUE INDEX "cellar_material_tenantId_kind_normalizedKey_key" ON "cellar_material"("tenantId", "kind", "normalizedKey");
DROP INDEX "cellar_material_kind_normalizedKey_key";
CREATE UNIQUE INDEX "vessel_group_member_tenantId_groupId_vesselId_key" ON "vessel_group_member"("tenantId", "groupId", "vesselId");
DROP INDEX "vessel_group_member_groupId_vesselId_key";
CREATE UNIQUE INDEX "analysis_reading_tenantId_panelId_analyte_key" ON "analysis_reading"("tenantId", "panelId", "analyte");
DROP INDEX "analysis_reading_panelId_analyte_key";

-- ── WineSku partial unique indexes recreated per-tenant (not expressible in Prisma) ──
CREATE UNIQUE INDEX "wine_sku_tenantId_name_vintage_bottleSizeMl_key" ON "wine_sku"("tenantId", "name", "vintage", "bottleSizeMl") WHERE "vintage" IS NOT NULL;
DROP INDEX "wine_sku_name_vintage_bottleSizeMl_key";
CREATE UNIQUE INDEX "wine_sku_tenantId_name_bottleSizeMl_nv_key" ON "wine_sku"("tenantId", "name", "bottleSizeMl") WHERE "isNonVintage";
DROP INDEX "wine_sku_name_bottleSizeMl_nv_key";

-- ── Composite (tenantId, id) uniques: parents of the U5b cross-tenant-risk FKs (K11) ──
CREATE UNIQUE INDEX "lot_tenantId_id_key" ON "lot"("tenantId", "id");
CREATE UNIQUE INDEX "vessel_tenantId_id_key" ON "vessel"("tenantId", "id");
CREATE UNIQUE INDEX "vineyard_tenantId_id_key" ON "vineyard"("tenantId", "id");
CREATE UNIQUE INDEX "harvest_pick_tenantId_id_key" ON "harvest_pick"("tenantId", "id");
CREATE UNIQUE INDEX "blend_trial_tenantId_id_key" ON "blend_trial"("tenantId", "id");

-- ── AppSettings becomes per-org: one settings row per tenant ──
CREATE UNIQUE INDEX "app_settings_tenantId_key" ON "app_settings"("tenantId");
