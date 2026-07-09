-- Phase 3 generic migration kernel - schema + RLS + grants in one migration.
-- Adds tenant-scoped staging/archive/reconciliation/mapping tables for the incumbent-agnostic
-- migration spine. No live ledger rows are written by these tables; publish goes through
-- writeLotOperation. All cross-tenant-risk references use composite (tenantId, refId) FKs.
--
-- ROLLBACK (Prisma has no down-migrations):
--   DROP TABLE "migration_analysis_reading", "migration_analysis_panel", "migration_reconciliation_item",
--     "legacy_operation", "migration_seed_position", "migration_seed_lot", "migration_entity_mapping",
--     "migration_field_mapping", "migration_import_batch" CASCADE;
--   ALTER TABLE "analysis_panel" DROP CONSTRAINT IF EXISTS "analysis_panel_tenantId_id_key";

SET lock_timeout = '5s';

CREATE TABLE "migration_import_batch" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceName" TEXT,
  "formatVersion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "cutoverAt" TIMESTAMP(3) NOT NULL,
  "sourceManifest" JSONB NOT NULL,
  "mappingSnapshot" JSONB,
  "reconciliationSnapshot" JSONB,
  "createdById" TEXT,
  "createdByEmail" TEXT,
  "signedOffById" TEXT,
  "signedOffByEmail" TEXT,
  "signedOffAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "publishedByEmail" TEXT,
  "publishedAt" TIMESTAMP(3),
  "discardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_import_batch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "migration_import_batch_status_check" CHECK ("status" IN ('DRAFT', 'PREFLIGHT_BLOCKED', 'READY_FOR_REVIEW', 'SIGNED_OFF', 'PUBLISHED', 'DISCARDED'))
);

CREATE TABLE "migration_seed_lot" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "sourceLotKey" TEXT NOT NULL,
  "sourceSystemId" TEXT,
  "code" TEXT NOT NULL,
  "displayName" TEXT,
  "form" TEXT NOT NULL,
  "productType" TEXT,
  "carbonation" TEXT,
  "declaredTaxClass" TEXT,
  "vintageYear" INTEGER,
  "originVineyardName" TEXT,
  "originBlockName" TEXT,
  "originVarietyName" TEXT,
  "legacySnapshot" JSONB,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "resolvedCode" TEXT,
  "resolvedExistingLotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_seed_lot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "migration_seed_lot_status_check" CHECK ("status" IN ('READY', 'BLOCKED', 'RESOLVED'))
);

CREATE TABLE "migration_seed_position" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "seedLotId" TEXT NOT NULL,
  "sourcePositionKey" TEXT NOT NULL,
  "sourceVesselKey" TEXT NOT NULL,
  "vesselId" TEXT,
  "vesselCode" TEXT NOT NULL,
  "accountType" TEXT NOT NULL DEFAULT 'VESSEL',
  "volumeL" DECIMAL(10,2) NOT NULL,
  "bondId" TEXT,
  "costAmount" DECIMAL(18,8),
  "costCurrency" TEXT,
  "costCompleteness" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "publishedOperationId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_seed_position_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "migration_seed_position_account_check" CHECK ("accountType" IN ('VESSEL')),
  CONSTRAINT "migration_seed_position_cost_check" CHECK ("costCompleteness" IN ('KNOWN', 'PARTIAL', 'UNKNOWN')),
  CONSTRAINT "migration_seed_position_volume_check" CHECK ("volumeL" > 0)
);

CREATE TABLE "legacy_operation" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceDataset" TEXT,
  "sourceObjectType" TEXT,
  "sourceActionId" TEXT NOT NULL,
  "sourceActionType" TEXT NOT NULL,
  "subjectType" TEXT,
  "occurredAt" TIMESTAMP(3),
  "sourceLotKey" TEXT,
  "lotId" TEXT,
  "lotCode" TEXT,
  "sourceVesselKey" TEXT,
  "vesselId" TEXT,
  "vesselCode" TEXT,
  "volume" DECIMAL(18,6),
  "volumeUnit" TEXT,
  "canonicalVolumeL" DECIMAL(10,2),
  "costAmount" DECIMAL(18,8),
  "costCurrency" TEXT,
  "actorName" TEXT,
  "note" TEXT,
  "evidenceRef" TEXT,
  "normalizedPayload" JSONB,
  "rawEvidence" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "legacy_operation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "migration_analysis_panel" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "sourcePanelKey" TEXT NOT NULL,
  "seedLotId" TEXT NOT NULL,
  "sourceVesselKey" TEXT,
  "vesselId" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "enteredByEmail" TEXT,
  "note" TEXT,
  "publishedPanelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_analysis_panel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "migration_analysis_reading" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "panelId" TEXT NOT NULL,
  "sourceReadingKey" TEXT,
  "analyte" TEXT NOT NULL,
  "value" DECIMAL(12,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_analysis_reading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "migration_reconciliation_item" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "expectedValue" DECIMAL(18,6),
  "actualValue" DECIMAL(18,6),
  "deltaValue" DECIMAL(18,6),
  "unit" TEXT,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "message" TEXT NOT NULL,
  "acceptedReason" TEXT,
  "acceptedById" TEXT,
  "acceptedByEmail" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_reconciliation_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "migration_reconciliation_item_kind_check" CHECK ("kind" IN ('VESSEL_VOLUME', 'LOT_VOLUME', 'LOT_COST', 'FINISHED_GOODS', 'TTB_TOTAL', 'CHEMISTRY_COUNT', 'UNMAPPED_ENTITY', 'PARTIAL_LINEAGE', 'PARSE_DIAGNOSTIC')),
  CONSTRAINT "migration_reconciliation_item_severity_check" CHECK ("severity" IN ('INFO', 'WARNING', 'BLOCKER')),
  CONSTRAINT "migration_reconciliation_item_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED', 'ACCEPTED'))
);

CREATE TABLE "migration_field_mapping" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceDataset" TEXT NOT NULL,
  "formatVersion" TEXT,
  "sourceObjectType" TEXT NOT NULL,
  "sourceField" TEXT NOT NULL,
  "targetField" TEXT NOT NULL,
  "transform" JSONB,
  "confirmedById" TEXT,
  "confirmedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_field_mapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "migration_entity_mapping" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceDataset" TEXT NOT NULL,
  "formatVersion" TEXT,
  "sourceObjectType" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "targetCode" TEXT,
  "resolution" JSONB,
  "confirmedById" TEXT,
  "confirmedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_entity_mapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "migration_import_batch_tenantId_id_key" ON "migration_import_batch"("tenantId", "id");
CREATE INDEX "migration_import_batch_tenantId_status_createdAt_idx" ON "migration_import_batch"("tenantId", "status", "createdAt");
CREATE INDEX "migration_import_batch_tenantId_idx" ON "migration_import_batch"("tenantId");

CREATE UNIQUE INDEX "migration_seed_lot_tenantId_importBatchId_sourceLotKey_key" ON "migration_seed_lot"("tenantId", "importBatchId", "sourceLotKey");
CREATE UNIQUE INDEX "migration_seed_lot_tenantId_id_key" ON "migration_seed_lot"("tenantId", "id");
CREATE INDEX "migration_seed_lot_tenantId_importBatchId_idx" ON "migration_seed_lot"("tenantId", "importBatchId");
CREATE INDEX "migration_seed_lot_tenantId_idx" ON "migration_seed_lot"("tenantId");

CREATE UNIQUE INDEX "migration_seed_position_tenantId_importBatchId_sourcePositionKey_key" ON "migration_seed_position"("tenantId", "importBatchId", "sourcePositionKey");
CREATE UNIQUE INDEX "migration_seed_position_tenantId_id_key" ON "migration_seed_position"("tenantId", "id");
CREATE UNIQUE INDEX "migration_seed_position_canonical_key" ON "migration_seed_position"("tenantId", "importBatchId", "seedLotId", "vesselId", "accountType") WHERE "vesselId" IS NOT NULL;
CREATE INDEX "migration_seed_position_tenantId_importBatchId_idx" ON "migration_seed_position"("tenantId", "importBatchId");
CREATE INDEX "migration_seed_position_tenantId_idx" ON "migration_seed_position"("tenantId");

CREATE UNIQUE INDEX "legacy_operation_tenantId_importBatchId_sourceSystem_sourceActionId_key" ON "legacy_operation"("tenantId", "importBatchId", "sourceSystem", "sourceActionId");
CREATE UNIQUE INDEX "legacy_operation_tenantId_id_key" ON "legacy_operation"("tenantId", "id");
CREATE UNIQUE INDEX "legacy_operation_published_source_key" ON "legacy_operation"("tenantId", "sourceSystem", "sourceActionId") WHERE "publishedAt" IS NOT NULL;
CREATE INDEX "legacy_operation_tenantId_importBatchId_idx" ON "legacy_operation"("tenantId", "importBatchId");
CREATE INDEX "legacy_operation_tenantId_lotId_occurredAt_idx" ON "legacy_operation"("tenantId", "lotId", "occurredAt");
CREATE INDEX "legacy_operation_tenantId_sourceLotKey_occurredAt_idx" ON "legacy_operation"("tenantId", "sourceLotKey", "occurredAt");
CREATE INDEX "legacy_operation_tenantId_idx" ON "legacy_operation"("tenantId");

CREATE UNIQUE INDEX "migration_analysis_panel_tenantId_importBatchId_sourcePanelKey_key" ON "migration_analysis_panel"("tenantId", "importBatchId", "sourcePanelKey");
CREATE UNIQUE INDEX "migration_analysis_panel_tenantId_id_key" ON "migration_analysis_panel"("tenantId", "id");
CREATE INDEX "migration_analysis_panel_tenantId_importBatchId_idx" ON "migration_analysis_panel"("tenantId", "importBatchId");
CREATE INDEX "migration_analysis_panel_tenantId_idx" ON "migration_analysis_panel"("tenantId");

CREATE UNIQUE INDEX "migration_analysis_reading_tenantId_panelId_analyte_key" ON "migration_analysis_reading"("tenantId", "panelId", "analyte");
CREATE UNIQUE INDEX "migration_analysis_reading_tenantId_id_key" ON "migration_analysis_reading"("tenantId", "id");
CREATE INDEX "migration_analysis_reading_tenantId_importBatchId_idx" ON "migration_analysis_reading"("tenantId", "importBatchId");
CREATE INDEX "migration_analysis_reading_tenantId_idx" ON "migration_analysis_reading"("tenantId");

CREATE UNIQUE INDEX "migration_reconciliation_item_tenantId_id_key" ON "migration_reconciliation_item"("tenantId", "id");
CREATE INDEX "migration_reconciliation_item_tenantId_importBatchId_status_severity_idx" ON "migration_reconciliation_item"("tenantId", "importBatchId", "status", "severity");
CREATE INDEX "migration_reconciliation_item_tenantId_idx" ON "migration_reconciliation_item"("tenantId");

CREATE UNIQUE INDEX "migration_field_mapping_tenantId_id_key" ON "migration_field_mapping"("tenantId", "id");
CREATE UNIQUE INDEX "migration_field_mapping_confirmed_key" ON "migration_field_mapping"("tenantId", "sourceSystem", "sourceDataset", (COALESCE("formatVersion", '')), "sourceObjectType", "sourceField");
CREATE INDEX "migration_field_mapping_tenantId_idx" ON "migration_field_mapping"("tenantId");

CREATE UNIQUE INDEX "migration_entity_mapping_tenantId_id_key" ON "migration_entity_mapping"("tenantId", "id");
CREATE UNIQUE INDEX "migration_entity_mapping_confirmed_key" ON "migration_entity_mapping"("tenantId", "sourceSystem", "sourceDataset", (COALESCE("formatVersion", '')), "sourceObjectType", "sourceKey");
CREATE INDEX "migration_entity_mapping_tenantId_idx" ON "migration_entity_mapping"("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "analysis_panel_tenantId_id_key" ON "analysis_panel"("tenantId", "id");

ALTER TABLE "migration_import_batch" ADD CONSTRAINT "migration_import_batch_tenantId_id_key" UNIQUE USING INDEX "migration_import_batch_tenantId_id_key";
ALTER TABLE "migration_seed_lot" ADD CONSTRAINT "migration_seed_lot_tenantId_id_key" UNIQUE USING INDEX "migration_seed_lot_tenantId_id_key";
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_id_key" UNIQUE USING INDEX "migration_seed_position_tenantId_id_key";
ALTER TABLE "migration_analysis_panel" ADD CONSTRAINT "migration_analysis_panel_tenantId_id_key" UNIQUE USING INDEX "migration_analysis_panel_tenantId_id_key";
ALTER TABLE "analysis_panel" ADD CONSTRAINT "analysis_panel_tenantId_id_key" UNIQUE USING INDEX "analysis_panel_tenantId_id_key";

ALTER TABLE "migration_import_batch" ADD CONSTRAINT "migration_import_batch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_seed_lot" ADD CONSTRAINT "migration_seed_lot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legacy_operation" ADD CONSTRAINT "legacy_operation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_panel" ADD CONSTRAINT "migration_analysis_panel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_reading" ADD CONSTRAINT "migration_analysis_reading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_reconciliation_item" ADD CONSTRAINT "migration_reconciliation_item_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_field_mapping" ADD CONSTRAINT "migration_field_mapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_entity_mapping" ADD CONSTRAINT "migration_entity_mapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "migration_seed_lot" ADD CONSTRAINT "migration_seed_lot_tenantId_importBatchId_fkey" FOREIGN KEY ("tenantId", "importBatchId") REFERENCES "migration_import_batch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_importBatchId_fkey" FOREIGN KEY ("tenantId", "importBatchId") REFERENCES "migration_import_batch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_seedLotId_fkey" FOREIGN KEY ("tenantId", "seedLotId") REFERENCES "migration_seed_lot"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_bondId_fkey" FOREIGN KEY ("tenantId", "bondId") REFERENCES "bond"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_seed_position" ADD CONSTRAINT "migration_seed_position_tenantId_publishedOperationId_fkey" FOREIGN KEY ("tenantId", "publishedOperationId") REFERENCES "lot_operation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legacy_operation" ADD CONSTRAINT "legacy_operation_tenantId_importBatchId_fkey" FOREIGN KEY ("tenantId", "importBatchId") REFERENCES "migration_import_batch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_operation" ADD CONSTRAINT "legacy_operation_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legacy_operation" ADD CONSTRAINT "legacy_operation_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "migration_analysis_panel" ADD CONSTRAINT "migration_analysis_panel_tenantId_importBatchId_fkey" FOREIGN KEY ("tenantId", "importBatchId") REFERENCES "migration_import_batch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_panel" ADD CONSTRAINT "migration_analysis_panel_tenantId_seedLotId_fkey" FOREIGN KEY ("tenantId", "seedLotId") REFERENCES "migration_seed_lot"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_panel" ADD CONSTRAINT "migration_analysis_panel_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_panel" ADD CONSTRAINT "migration_analysis_panel_tenantId_publishedPanelId_fkey" FOREIGN KEY ("tenantId", "publishedPanelId") REFERENCES "analysis_panel"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_reading" ADD CONSTRAINT "migration_analysis_reading_tenantId_importBatchId_fkey" FOREIGN KEY ("tenantId", "importBatchId") REFERENCES "migration_import_batch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_analysis_reading" ADD CONSTRAINT "migration_analysis_reading_tenantId_panelId_fkey" FOREIGN KEY ("tenantId", "panelId") REFERENCES "migration_analysis_panel"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "migration_reconciliation_item" ADD CONSTRAINT "migration_reconciliation_item_tenantId_importBatchId_fkey" FOREIGN KEY ("tenantId", "importBatchId") REFERENCES "migration_import_batch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'migration_import_batch',
    'migration_seed_lot',
    'migration_seed_position',
    'legacy_operation',
    'migration_analysis_panel',
    'migration_analysis_reading',
    'migration_reconciliation_item',
    'migration_field_mapping',
    'migration_entity_mapping'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', r);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rls', r);
  END LOOP;
END
$$;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'migration_import_batch',
    'migration_seed_lot',
    'migration_seed_position',
    'legacy_operation',
    'migration_analysis_panel',
    'migration_analysis_reading',
    'migration_reconciliation_item',
    'migration_field_mapping',
    'migration_entity_mapping'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', r;
    END IF;
  END LOOP;
END
$$;
