# Entity-relationship diagrams

> **Generated — do not edit.** `npm run docs:data-dictionary` rebuilds this. Column detail:
> [[data-dictionary]].

**188 tables · 439 foreign keys**, of which **183 are composite**
`(tenantId, refId) → (tenantId, id)` — the shape that makes a cross-tenant reference structurally
impossible. Prisma cannot express those, so they are absent from Prisma Studio; they are real
`pg_constraint` rows and appear below.

One diagram per domain, because 188 tables in a single graph is unreadable. An edge to a table
outside the current domain is still drawn — that is where the seams are.

⚠️ **The universal `tenantId → organization` edge is omitted from the pictures.** All 188 tables
carry it (158 constraints), so drawing it conveys nothing and turns `organization` into a hub that
flattens every layout. It is still listed per table in [[data-dictionary]] — omitted from the
picture, not from the record.

## Identity & access

_Who can sign in, which winery they belong to, and what they may reach._

12 tables · 10 outgoing references

```mermaid
erDiagram
  account
  app_settings
  invitation
  member
  organization
  owner
  session
  user
  user_vineyard
  verification
  voice_preference
  voice_profile
  user ||--o{ account : "userId"
  user ||--o{ invitation : "inviterId"
  organization ||--o{ invitation : "organizationId"
  organization ||--o{ member : "organizationId"
  user ||--o{ member : "userId"
  user ||--o{ session : "userId"
  user ||--o{ user_vineyard : "userId"
  vineyard ||--o{ user_vineyard : "vineyardId"
  user ||--o{ voice_preference : "userId"
  user ||--o{ voice_profile : "userId"
```

## Weather & climate

_Observed and forecast weather per vineyard, plus provider quota tracking._

6 tables · 5 outgoing references

```mermaid
erDiagram
  vineyard_climate_daily
  vineyard_forecast_daily
  vineyard_forecast_hourly
  vineyard_weather_alert_state
  vineyard_weather_config
  weather_provider_usage
  vineyard ||--o{ vineyard_climate_daily : "tenantId+vineyardId"
  vineyard ||--o{ vineyard_forecast_daily : "tenantId+vineyardId"
  vineyard ||--o{ vineyard_forecast_hourly : "tenantId+vineyardId"
  vineyard ||--o{ vineyard_weather_alert_state : "tenantId+vineyardId"
  vineyard ||--o{ vineyard_weather_config : "tenantId+vineyardId"
```

## Spray & pest

_The pesticide corpus, tenant product facts, and the append-only spray chain._

24 tables · 26 outgoing references

```mermaid
erDiagram
  latent_infection_event
  legacy_spray_mapping
  pesticide_active_ingredient
  pesticide_data_revision
  pesticide_pest_category
  pesticide_product
  pesticide_product_condition
  pesticide_product_facts
  pesticide_product_ingredient
  pesticide_product_pest
  pesticide_product_phi_condition
  pesticide_product_rei_condition
  pesticide_resistance_assignment
  pesticide_separation_rule
  pesticide_site_registration
  pesticide_state_registration
  pesticide_use_restriction
  planned_harvest_date_event
  spray_application
  spray_block_line
  spray_drying_override
  spray_material_line
  spray_mix_order_line
  tenant_product_facts
  vineyard_block ||--o{ latent_infection_event : "tenantId+blockId"
  latent_infection_event ||--o{ latent_infection_event : "tenantId+reversesRowId"
  latent_infection_event ||--o{ latent_infection_event : "tenantId+supersedesRowId"
  pesticide_active_ingredient ||--o{ pesticide_active_ingredient : "parentActiveIngredientId"
  pesticide_product_facts ||--o{ pesticide_product_condition : "factsId"
  pesticide_active_ingredient ||--o{ pesticide_product_ingredient : "activeIngredientId"
  pesticide_product ||--o{ pesticide_product_ingredient : "productId"
  pesticide_pest_category ||--o{ pesticide_product_pest : "pestCode"
  pesticide_product_facts ||--o{ pesticide_product_phi_condition : "factsId"
  pesticide_product_facts ||--o{ pesticide_product_rei_condition : "factsId"
  pesticide_active_ingredient ||--o{ pesticide_resistance_assignment : "activeIngredientId"
  pesticide_product ||--o{ pesticide_resistance_assignment : "productId"
  pesticide_product_facts ||--o{ pesticide_separation_rule : "factsId"
  pesticide_product ||--o{ pesticide_site_registration : "productId"
  pesticide_product ||--o{ pesticide_state_registration : "productId"
  pesticide_product ||--o{ pesticide_use_restriction : "productId"
  vineyard_block ||--o{ planned_harvest_date_event : "tenantId+blockId"
  spray_application ||--o{ spray_application : "tenantId+supersededByApplicationId"
  spray_application ||--o{ spray_application : "tenantId+supersedesApplicationId"
  vineyard ||--o{ spray_application : "tenantId+vineyardId"
  spray_application ||--o{ spray_block_line : "tenantId+applicationId"
  vineyard_block ||--o{ spray_block_line : "tenantId+blockId"
  spray_block_line ||--o{ spray_drying_override : "tenantId+blockLineId"
  spray_application ||--o{ spray_material_line : "tenantId+applicationId"
  spray_application ||--o{ spray_mix_order_line : "tenantId+applicationId"
  spray_material_line ||--o{ spray_mix_order_line : "tenantId+applicationId+materialLineId"
```

## The land

_Vineyards, blocks, plantings, and the geospatial layers over them._

20 tables · 21 outgoing references

```mermaid
erDiagram
  block_soil_snapshot
  block_spatial_metric
  cdse_usage_counter
  field_input
  field_note
  grower
  grower_contact
  location
  spatial_analysis_job
  spatial_dataset
  spatial_dataset_derivative
  spatial_scene
  spatial_style
  variety
  vineyard
  vineyard_block
  vineyard_detail
  vineyard_geometry_version
  vineyard_planting_area
  vineyard_subblock
  vineyard_block ||--o{ block_soil_snapshot : "tenantId+blockId+vineyardId"
  vineyard_block ||--o{ block_spatial_metric : "tenantId+blockId+vineyardId"
  spatial_dataset ||--o{ block_spatial_metric : "tenantId+datasetId"
  user ||--o{ field_note : "userId"
  vineyard ||--o{ field_note : "vineyardId"
  vendor ||--o{ grower : "tenantId+vendorId"
  grower ||--o{ grower_contact : "tenantId+growerId"
  vineyard ||--o{ spatial_analysis_job : "tenantId+vineyardId"
  spatial_scene ||--o{ spatial_dataset : "tenantId+sceneId"
  vineyard ||--o{ spatial_dataset : "tenantId+vineyardId"
  spatial_dataset ||--o{ spatial_dataset_derivative : "tenantId+datasetId+vineyardId"
  vineyard ||--o{ spatial_scene : "tenantId+vineyardId"
  vineyard ||--o{ spatial_style : "tenantId+vineyardId"
  grower ||--o{ vineyard : "tenantId+growerId"
  grower ||--o{ vineyard_block : "tenantId+growerId"
  vineyard_planting_area ||--o{ vineyard_block : "tenantId+plantingAreaId"
  variety ||--o{ vineyard_block : "varietyId"
  vineyard ||--o{ vineyard_block : "vineyardId"
  vineyard ||--o{ vineyard_detail : "vineyardId"
  vineyard ||--o{ vineyard_planting_area : "vineyardId"
  vineyard_block ||--o{ vineyard_subblock : "blockId"
```

## Harvest

_Picks, weigh tags, and Brix readings coming off the vineyard._

6 tables · 10 outgoing references

```mermaid
erDiagram
  brix_log
  harvest_pick
  harvest_record
  weigh_tag
  weigh_tag_counter
  weigh_tag_line
  vineyard_block ||--o{ brix_log : "blockId"
  vineyard ||--o{ brix_log : "vineyardId"
  harvest_record ||--o{ harvest_pick : "harvestRecordId"
  weigh_tag_line ||--o{ harvest_pick : "tenantId+weighTagLineId"
  vineyard_block ||--o{ harvest_record : "blockId"
  vineyard ||--o{ harvest_record : "vineyardId"
  vineyard_block ||--o{ weigh_tag_line : "tenantId+blockId"
  grower ||--o{ weigh_tag_line : "tenantId+growerId"
  owner ||--o{ weigh_tag_line : "tenantId+ownerId"
  weigh_tag ||--o{ weigh_tag_line : "weighTagId"
```

## Vendors & ingest

_Vendors and the invoice/document ingestion staging tables._

8 tables · 14 outgoing references

```mermaid
erDiagram
  ingested_invoice
  ingested_invoice_line
  ingested_invoice_line_created_asset
  lot_document
  vendor
  vendor_contact
  vendor_import_candidate
  vendor_material_code
  vendor ||--o{ ingested_invoice : "tenantId+vendorId"
  finished_good ||--o{ ingested_invoice_line : "tenantId+finishedGoodTargetId"
  wine_sku ||--o{ ingested_invoice_line : "tenantId+wineSkuTargetId"
  supply_lot ||--o{ ingested_invoice_line : "tenantId+createdSupplyLotId"
  ingested_invoice ||--o{ ingested_invoice_line : "tenantId+ingestedInvoiceId"
  cellar_material ||--o{ ingested_invoice_line : "tenantId+matchedMaterialId"
  equipment_asset ||--o{ ingested_invoice_line_created_asset : "tenantId+equipmentAssetId"
  ingested_invoice_line ||--o{ ingested_invoice_line_created_asset : "tenantId+lineId"
  ingested_invoice ||--o{ lot_document : "tenantId+ingestedInvoiceId"
  supply_lot ||--o{ lot_document : "tenantId+supplyLotId"
  vendor ||--o{ vendor_contact : "tenantId+vendorId"
  vendor ||--o{ vendor_import_candidate : "tenantId+suggestedVendorId"
  cellar_material ||--o{ vendor_material_code : "tenantId+materialId"
  vendor ||--o{ vendor_material_code : "tenantId+vendorId"
```

## Lots & the operation ledger

_THE CORE. A lot is identity; its volume is the FOLD of an append-only operation ledger. vessel_lot and lot_vineyard are maintained projections, not source of truth._

15 tables · 38 outgoing references

```mermaid
erDiagram
  lot
  lot_code_event
  lot_cost_state
  lot_harvest_source
  lot_identifier
  lot_lineage
  lot_operation
  lot_operation_line
  lot_state_event
  lot_tasting_note
  lot_treatment
  lot_vineyard
  naming_template
  naming_template_version
  vessel_lot
  owner ||--o{ lot : "tenantId+ownerId"
  owner ||--o{ lot_code_event : "tenantId+ownerId"
  lot ||--o{ lot_code_event : "tenantId+lotId"
  lot ||--o{ lot_cost_state : "tenantId+lotId"
  owner ||--o{ lot_harvest_source : "tenantId+ownerId"
  harvest_pick ||--o{ lot_harvest_source : "tenantId+harvestPickId"
  lot ||--o{ lot_harvest_source : "tenantId+lotId"
  owner ||--o{ lot_identifier : "tenantId+ownerId"
  lot ||--o{ lot_identifier : "tenantId+lotId"
  lot ||--o{ lot_lineage : "tenantId+childLotId"
  lot ||--o{ lot_lineage : "tenantId+parentLotId"
  lot_operation ||--o{ lot_operation : "correctsOperationId"
  lot_operation ||--o{ lot_operation_line : "operationId"
  owner ||--o{ lot_operation_line : "tenantId+ownerId"
  bond ||--o{ lot_operation_line : "tenantId+destBondId"
  lot ||--o{ lot_operation_line : "tenantId+lotId"
  bond ||--o{ lot_operation_line : "tenantId+sourceBondId"
  vessel ||--o{ lot_operation_line : "tenantId+vesselId"
  lot ||--o{ lot_state_event : "lotId"
  lot_operation ||--o{ lot_state_event : "operationId"
  owner ||--o{ lot_state_event : "tenantId+ownerId"
  vessel ||--o{ lot_state_event : "vesselId"
  lot ||--o{ lot_tasting_note : "lotId"
  owner ||--o{ lot_tasting_note : "tenantId+ownerId"
  vessel ||--o{ lot_tasting_note : "vesselId"
  lot ||--o{ lot_treatment : "lotId"
  cellar_material ||--o{ lot_treatment : "materialId"
  lot_operation ||--o{ lot_treatment : "operationId"
  owner ||--o{ lot_treatment : "tenantId+ownerId"
  vessel ||--o{ lot_treatment : "vesselId"
  lot_operation ||--o{ lot_treatment : "voidedByOperationId"
  owner ||--o{ lot_vineyard : "tenantId+ownerId"
  lot ||--o{ lot_vineyard : "tenantId+lotId"
  vineyard ||--o{ lot_vineyard : "tenantId+vineyardId"
  naming_template ||--o{ naming_template_version : "tenantId+templateId"
  owner ||--o{ vessel_lot : "tenantId+ownerId"
  lot ||--o{ vessel_lot : "tenantId+lotId"
  vessel ||--o{ vessel_lot : "tenantId+vesselId"
```

## Vessels, analysis & trials

_Tanks and barrels, what is dissolved in them, lab readings, and blend trials._

14 tables · 30 outgoing references

```mermaid
erDiagram
  analysis_panel
  analysis_reading
  blend_trial
  blend_trial_component
  cellar_material
  press_cycle
  sample
  vessel
  vessel_activity_event
  vessel_activity_supply_use
  vessel_component
  vessel_group
  vessel_group_member
  vessel_transfer
  lot ||--o{ analysis_panel : "lotId"
  owner ||--o{ analysis_panel : "tenantId+ownerId"
  sample ||--o{ analysis_panel : "sampleId"
  vessel ||--o{ analysis_panel : "vesselId"
  analysis_panel ||--o{ analysis_reading : "panelId"
  lot ||--o{ blend_trial : "promotedToLotId"
  lot ||--o{ blend_trial_component : "tenantId+lotId"
  blend_trial ||--o{ blend_trial_component : "tenantId+trialId"
  vendor ||--o{ cellar_material : "tenantId+vendorId"
  lot ||--o{ sample : "lotId"
  owner ||--o{ sample : "tenantId+ownerId"
  vessel ||--o{ sample : "vesselId"
  cellar_material ||--o{ vessel_activity_event : "tenantId+materialId"
  work_order_task ||--o{ vessel_activity_event : "tenantId+taskId"
  vessel ||--o{ vessel_activity_event : "tenantId+vesselId"
  vessel_activity_event ||--o{ vessel_activity_supply_use : "tenantId+vesselActivityEventId"
  cellar_material ||--o{ vessel_activity_supply_use : "tenantId+materialId"
  supply_lot ||--o{ vessel_activity_supply_use : "tenantId+supplyLotId"
  variety ||--o{ vessel_component : "varietyId"
  vessel ||--o{ vessel_component : "vesselId"
  vineyard ||--o{ vessel_component : "vineyardId"
  location ||--o{ vessel_group : "tenantId+locationId"
  vessel_group ||--o{ vessel_group_member : "groupId"
  vessel_group ||--o{ vessel_group_member : "tenantId+groupId"
  vessel ||--o{ vessel_group_member : "tenantId+vesselId"
  vessel ||--o{ vessel_group_member : "vesselId"
  vessel ||--o{ vessel_transfer : "fromVesselId"
  lot_operation ||--o{ vessel_transfer : "lotOperationId"
  vessel_transfer ||--o{ vessel_transfer : "revertsId"
  vessel ||--o{ vessel_transfer : "toVesselId"
```

## Materials & equipment

_Consumables, supply lots, barrels, and tracked equipment assets._

8 tables · 19 outgoing references

```mermaid
erDiagram
  barrel_asset
  barrel_fill
  custom_unit
  equipment_asset
  material_movement
  stock_movement
  supply_consumption
  supply_lot
  vessel ||--o{ barrel_asset : "tenantId+vesselId"
  owner ||--o{ barrel_fill : "tenantId+ownerId"
  barrel_asset ||--o{ barrel_fill : "tenantId+barrelAssetId"
  lot ||--o{ barrel_fill : "tenantId+lotId"
  lot_operation ||--o{ barrel_fill : "tenantId+openOpId"
  vendor ||--o{ equipment_asset : "tenantId+vendorId"
  location ||--o{ material_movement : "tenantId+locationId"
  cellar_material ||--o{ material_movement : "tenantId+materialId"
  supply_lot ||--o{ material_movement : "tenantId+supplyLotId"
  bottling_run ||--o{ stock_movement : "bottlingRunId"
  finished_good ||--o{ stock_movement : "finishedGoodId"
  location ||--o{ stock_movement : "locationId"
  owner ||--o{ stock_movement : "tenantId+ownerId"
  wine_sku ||--o{ stock_movement : "wineSkuId"
  lot_operation ||--o{ supply_consumption : "tenantId+operationId"
  supply_lot ||--o{ supply_consumption : "tenantId+supplyLotId"
  location ||--o{ supply_lot : "tenantId+locationId"
  cellar_material ||--o{ supply_lot : "tenantId+materialId"
  vendor ||--o{ supply_lot : "tenantId+vendorId"
```

## Work orders

_The human process layer — tasks, attempts, templates, reservations._

11 tables · 21 outgoing references

```mermaid
erDiagram
  calculation_log
  reservation
  work_order
  work_order_dependency
  work_order_task
  work_order_task_attempt
  work_order_task_equipment
  work_order_task_type
  work_order_task_type_overlay
  work_order_template
  work_order_template_version
  lot ||--o{ reservation : "tenantId+lotId"
  cellar_material ||--o{ reservation : "tenantId+materialId"
  work_order_task ||--o{ reservation : "tenantId+taskId"
  vessel ||--o{ reservation : "tenantId+vesselId"
  work_order ||--o{ reservation : "tenantId+workOrderId"
  work_order_template_version ||--o{ work_order : "tenantId+templateVersionId"
  work_order ||--o{ work_order_dependency : "tenantId+dependsOnWorkOrderId"
  work_order ||--o{ work_order_dependency : "tenantId+workOrderId"
  vineyard_block ||--o{ work_order_task : "tenantId+blockId"
  vessel ||--o{ work_order_task : "tenantId+destVesselId"
  lot ||--o{ work_order_task : "tenantId+lotId"
  cellar_material ||--o{ work_order_task : "tenantId+materialId"
  vessel ||--o{ work_order_task : "tenantId+sourceVesselId"
  vessel_group ||--o{ work_order_task : "tenantId+vesselGroupId"
  work_order ||--o{ work_order_task : "tenantId+workOrderId"
  lot_operation ||--o{ work_order_task_attempt : "tenantId+correctionOperationId"
  lot_operation ||--o{ work_order_task_attempt : "tenantId+operationId"
  work_order_task ||--o{ work_order_task_attempt : "tenantId+taskId"
  equipment_asset ||--o{ work_order_task_equipment : "tenantId+equipmentId"
  work_order_task ||--o{ work_order_task_equipment : "tenantId+taskId"
  work_order_template ||--o{ work_order_template_version : "tenantId+templateId"
```

## Bottling & finished goods

_Bottling runs, SKUs, and finished-goods inventory._

10 tables · 26 outgoing references

```mermaid
erDiagram
  bottled_inventory
  bottled_lot_state
  bottling_cost_snapshot
  bottling_run
  bottling_source
  finished_good
  finished_good_category
  finished_good_inventory
  finished_good_receipt
  wine_sku
  location ||--o{ bottled_inventory : "locationId"
  owner ||--o{ bottled_inventory : "tenantId+ownerId"
  wine_sku ||--o{ bottled_inventory : "wineSkuId"
  location ||--o{ bottled_lot_state : "locationId"
  lot ||--o{ bottled_lot_state : "lotId"
  owner ||--o{ bottled_lot_state : "tenantId+ownerId"
  bottling_run ||--o{ bottling_cost_snapshot : "tenantId+runId"
  wine_sku ||--o{ bottling_cost_snapshot : "tenantId+skuId"
  location ||--o{ bottling_run : "destinationLocationId"
  owner ||--o{ bottling_run : "tenantId+ownerId"
  wine_sku ||--o{ bottling_run : "wineSkuId"
  bottling_run ||--o{ bottling_source : "bottlingRunId"
  owner ||--o{ bottling_source : "tenantId+ownerId"
  lot ||--o{ bottling_source : "tenantId+lotId"
  variety ||--o{ bottling_source : "varietyId"
  vessel ||--o{ bottling_source : "vesselId"
  vineyard ||--o{ bottling_source : "vineyardId"
  finished_good_category ||--o{ finished_good : "categoryId"
  finished_good ||--o{ finished_good_inventory : "finishedGoodId"
  location ||--o{ finished_good_inventory : "locationId"
  finished_good ||--o{ finished_good_receipt : "tenantId+finishedGoodId"
  location ||--o{ finished_good_receipt : "tenantId+locationId"
  wine_sku ||--o{ finished_good_receipt : "tenantId+wineSkuId"
  vendor ||--o{ finished_good_receipt : "tenantId+vendorId"
  finished_good_category ||--o{ wine_sku : "categoryId"
  owner ||--o{ wine_sku : "tenantId+ownerId"
```

## Cost & accounting

_Cost roll-up, variance, A/P export, FX, and the accounting connection._

15 tables · 17 outgoing references

```mermaid
erDiagram
  account_mapping
  accounting_connection
  accounting_delivery
  ap_export_event
  billable_wine_consumed
  commerce7_connection
  commerce7_install_state
  commerce7_order
  commerce7_sku_map
  cost_export_event
  cost_line
  cost_variance_event
  fx_rate
  operation_cost_transfer
  sales_export_event
  ap_export_event ||--o{ accounting_delivery : "tenantId+apExportEventId"
  accounting_connection ||--o{ accounting_delivery : "tenantId+connectionId"
  cost_export_event ||--o{ accounting_delivery : "tenantId+costExportEventId"
  sales_export_event ||--o{ accounting_delivery : "tenantId+salesExportEventId"
  vendor ||--o{ ap_export_event : "tenantId+vendorId"
  owner ||--o{ billable_wine_consumed : "tenantId+consumedOwnerId"
  lot ||--o{ billable_wine_consumed : "tenantId+sourceLotId"
  lot_operation ||--o{ billable_wine_consumed : "operationId"
  owner ||--o{ billable_wine_consumed : "tenantId+receivingOwnerId"
  wine_sku ||--o{ commerce7_sku_map : "tenantId+wineSkuId"
  owner ||--o{ cost_line : "tenantId+ownerId"
  lot ||--o{ cost_line : "tenantId+lotId"
  lot_operation ||--o{ cost_line : "tenantId+operationId"
  bottling_cost_snapshot ||--o{ cost_variance_event : "tenantId+snapshotId"
  lot ||--o{ operation_cost_transfer : "tenantId+fromLotId"
  lot_operation ||--o{ operation_cost_transfer : "tenantId+operationId"
  lot ||--o{ operation_cost_transfer : "tenantId+toLotId"
```

## Compliance & tax

_TTB reporting, bond isolation, tax class, and reminders._

6 tables · 5 outgoing references

```mermaid
erDiagram
  bond
  change_of_tax_class_event
  compliance_profile
  compliance_reminder_log
  compliance_reminder_preference
  compliance_report
  owner ||--o{ bond : "tenantId+ownerId"
  lot ||--o{ change_of_tax_class_event : "tenantId+lotId"
  user ||--o{ compliance_reminder_preference : "userId"
  compliance_report ||--o{ compliance_report : "amendsReportId"
  bond ||--o{ compliance_report : "tenantId+bondId"
```

## Assistant & feedback

_The AI assistant's conversations, confirmations, and the feedback loop._

10 tables · 10 outgoing references

```mermaid
erDiagram
  assistant_confirmation
  assistant_conversation
  assistant_feedback
  assistant_message
  assistant_tool_call
  automation_run
  feedback_attachment
  feedback_clarification
  feedback_linear_link
  feedback_ticket
  user ||--o{ assistant_conversation : "ownerUserId"
  assistant_conversation ||--o{ assistant_message : "conversationId"
  assistant_feedback ||--o{ automation_run : "tenantId+assistantFeedbackId"
  feedback_ticket ||--o{ automation_run : "tenantId+ticketId"
  assistant_feedback ||--o{ feedback_attachment : "tenantId+assistantFeedbackId"
  feedback_ticket ||--o{ feedback_attachment : "tenantId+ticketId"
  assistant_feedback ||--o{ feedback_clarification : "tenantId+assistantFeedbackId"
  feedback_ticket ||--o{ feedback_clarification : "tenantId+ticketId"
  assistant_feedback ||--o{ feedback_linear_link : "tenantId+assistantFeedbackId"
  feedback_ticket ||--o{ feedback_linear_link : "tenantId+ticketId"
```

## Knowledge base

_The crawled corpus behind the assistant's domain answers._

9 tables · 5 outgoing references

```mermaid
erDiagram
  candidate_source
  knowledge_blob
  knowledge_chunk
  knowledge_document
  knowledge_source
  knowledge_source_subscription
  knowledge_url_observation
  oauth_state
  trusted_domain
  knowledge_document ||--o{ knowledge_chunk : "documentId"
  knowledge_blob ||--o{ knowledge_document : "blobId"
  knowledge_source ||--o{ knowledge_document : "sourceId"
  knowledge_source ||--o{ knowledge_source_subscription : "sourceId"
  knowledge_document ||--o{ knowledge_url_observation : "documentId"
```

## Inbox

_Per-user notifications and direct messages. NOTE: per-USER row security on top of per-tenant — a tenant-only read returns zero rows._

4 tables · 8 outgoing references

```mermaid
erDiagram
  direct_message
  direct_message_attachment
  direct_message_thread
  inbox_notification
  user ||--o{ direct_message : "senderUserId"
  direct_message_thread ||--o{ direct_message : "tenantId+threadId"
  direct_message ||--o{ direct_message_attachment : "tenantId+messageId"
  user ||--o{ direct_message_thread : "createdByUserId"
  user ||--o{ direct_message_thread : "userAId"
  user ||--o{ direct_message_thread : "userBId"
  user ||--o{ inbox_notification : "actorUserId"
  user ||--o{ inbox_notification : "recipientUserId"
```

## Migration & audit

_Cutover import staging and the immutable audit log._

10 tables · 16 outgoing references

```mermaid
erDiagram
  audit_log
  legacy_operation
  migration_analysis_panel
  migration_analysis_reading
  migration_entity_mapping
  migration_field_mapping
  migration_import_batch
  migration_reconciliation_item
  migration_seed_lot
  migration_seed_position
  migration_import_batch ||--o{ legacy_operation : "tenantId+importBatchId"
  lot ||--o{ legacy_operation : "tenantId+lotId"
  vessel ||--o{ legacy_operation : "tenantId+vesselId"
  migration_import_batch ||--o{ migration_analysis_panel : "tenantId+importBatchId"
  analysis_panel ||--o{ migration_analysis_panel : "tenantId+publishedPanelId"
  migration_seed_lot ||--o{ migration_analysis_panel : "tenantId+seedLotId"
  vessel ||--o{ migration_analysis_panel : "tenantId+vesselId"
  migration_import_batch ||--o{ migration_analysis_reading : "tenantId+importBatchId"
  migration_analysis_panel ||--o{ migration_analysis_reading : "tenantId+panelId"
  migration_import_batch ||--o{ migration_reconciliation_item : "tenantId+importBatchId"
  migration_import_batch ||--o{ migration_seed_lot : "tenantId+importBatchId"
  bond ||--o{ migration_seed_position : "tenantId+bondId"
  migration_import_batch ||--o{ migration_seed_position : "tenantId+importBatchId"
  lot_operation ||--o{ migration_seed_position : "tenantId+publishedOperationId"
  migration_seed_lot ||--o{ migration_seed_position : "tenantId+seedLotId"
  vessel ||--o{ migration_seed_position : "tenantId+vesselId"
```

