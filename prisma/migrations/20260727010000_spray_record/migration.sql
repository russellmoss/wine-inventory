-- Spray Intelligence S3a — spray application record + planned harvest date.
-- (docs/spray_assistant/phases/S3a-spray-record-plan.md, council-reconciled 2026-07-26)
--
-- Seven tenant-scoped tables on the AGENTS.md Phase-12 checklist. All enums are BORN here
-- (no ALTER TYPE — the Windows enum rule does not bite). Cross-table FKs are raw-SQL composite
-- (tenantId, refId) → (tenantId, id) (K11). The six append-only tables get a BEFORE UPDATE
-- trigger (per-table bookkeeping allowlist) and a BEFORE DELETE trigger (owner-only purge escape
-- hatch, council C15). The knownness CHECKs on spray_material_line are the database enforcement
-- of rule §3.6 (council C7): an empty snapshot array can never coexist with known = true.

-- ─────────────────────────────── 1) Enums (all new) ───────────────────────────────
CREATE TYPE "SprayApplicationMethod" AS ENUM ('AIRBLAST', 'BOOM', 'HANDGUN', 'BACKPACK', 'CHEMIGATION', 'AERIAL', 'OTHER');
CREATE TYPE "SprayRecordStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'VOIDED');
CREATE TYPE "SprayCorrectionKind" AS ENUM ('AMENDMENT', 'VOID');
CREATE TYPE "SprayMaterialRole" AS ENUM ('PESTICIDE', 'ADJUVANT', 'FERTILIZER', 'OTHER');
CREATE TYPE "SprayAdjuvantClass" AS ENUM ('NONIONIC_SURFACTANT', 'ORGANOSILICONE_PENETRANT', 'CROP_OIL_CONCENTRATE', 'METHYLATED_SEED_OIL', 'STICKER_SPREADER', 'BUFFER_ACIDIFIER', 'WATER_CONDITIONER', 'DEFOAMER', 'OTHER');
CREATE TYPE "SprayQuantityUnit" AS ENUM ('GAL', 'QT', 'PT', 'FLOZ', 'LB', 'OZ', 'L', 'ML', 'KG', 'G');
CREATE TYPE "SprayQuantityDimension" AS ENUM ('VOLUME', 'MASS');
CREATE TYPE "SprayQuantityBasis" AS ENUM ('TOTAL_IN_TANK', 'PER_AREA', 'PER_CARRIER_VOLUME');
CREATE TYPE "SprayMobilityClass" AS ENUM ('CONTACT_PROTECTANT', 'TRANSLAMINAR', 'LOCALLY_SYSTEMIC', 'MOBILE_SYSTEMIC');
CREATE TYPE "SprayFactsCompleteness" AS ENUM ('KNOWN', 'PARTIAL', 'UNKNOWN');
CREATE TYPE "SprayFactsSource" AS ENUM ('NONE', 'REGISTRY', 'TENANT_DEFINED');
CREATE TYPE "SprayProductIdentitySource" AS ENUM ('EPA_REGISTRY', 'TENANT_DEFINED', 'LEGACY_NAME_ONLY', 'UNKNOWN');
CREATE TYPE "SprayRateBasis" AS ENUM ('MEASURED', 'HEADER_VOLUME', 'UNKNOWN');
CREATE TYPE "SprayAreaSource" AS ENUM ('DERIVED_FROM_SPACING', 'OPERATOR_ENTERED', 'SURVEYED');
CREATE TYPE "SprayDepositionMethod" AS ENUM ('WATER_SENSITIVE_CARD', 'DYE', 'VISUAL', 'OTHER');
CREATE TYPE "SprayRowPattern" AS ENUM ('EVERY_ROW', 'ALTERNATE_ROW');
CREATE TYPE "SprayDilutionMode" AS ENUM ('DILUTE', 'CONCENTRATE');
CREATE TYPE "SprayWeatherSource" AS ENUM ('OPERATOR_OBSERVED', 'STATION', 'GRID_ESTIMATE');
CREATE TYPE "SprayWindDirection" AS ENUM ('N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'CALM', 'VARIABLE');
CREATE TYPE "SprayDriedBasis" AS ENUM ('NO_RAIN_IN_WINDOW', 'HOURLY_PRECIP', 'INSUFFICIENT_DATA');
CREATE TYPE "PlannedHarvestStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RETRACTED');
CREATE TYPE "LegacySprayMappingStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

-- ─────────────────────────────── 2) spray_application ───────────────────────────────
CREATE TABLE "spray_application" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "applicatorUserId" TEXT,
    "applicatorName" TEXT NOT NULL,
    "applicatorLicense" TEXT,
    "operatorIdNumber" TEXT,
    "countyPermitNumber" TEXT,
    "applicationMethod" "SprayApplicationMethod" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "targetPest" TEXT,
    "targetPestCode" TEXT,
    "rowPattern" "SprayRowPattern",
    "dilutionMode" "SprayDilutionMode",
    "sprayVolumePerHaL" DECIMAL(18,8),
    "groundSpeedKph" DECIMAL(10,2),
    "tankVolumeL" DECIMAL(18,8),
    "carrierWaterVolumeL" DECIMAL(18,8),
    "sprayWaterPh" DECIMAL(4,2),
    "airTempC" DECIMAL(10,2),
    "windSpeedKph" DECIMAL(10,2),
    "windDirection" "SprayWindDirection",
    "windDirectionDeg" INTEGER,
    "relHumidityPct" DECIMAL(10,2),
    "weatherObservedAt" TIMESTAMP(3),
    "weatherSource" "SprayWeatherSource",
    "sprayRigName" TEXT,
    "tractorName" TEXT,
    "gearSetting" TEXT,
    "status" "SprayRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesApplicationId" TEXT,
    "supersededByApplicationId" TEXT,
    "correctionKind" "SprayCorrectionKind",
    "correctionReason" TEXT,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captureMethod" "CaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "commandId" TEXT,
    "requestHash" TEXT,
    "notes" TEXT,
    CONSTRAINT "spray_application_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spray_application_tenantId_id_key" ON "spray_application"("tenantId", "id");
ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_tenantId_id_key" UNIQUE USING INDEX "spray_application_tenantId_id_key";
-- at-most-once correction — covers the VOID path too (KD-1 / council C2)
CREATE UNIQUE INDEX "spray_application_tenantId_supersedesApplicationId_key" ON "spray_application"("tenantId", "supersedesApplicationId");
CREATE UNIQUE INDEX "spray_application_tenantId_commandId_key" ON "spray_application"("tenantId", "commandId");
CREATE INDEX "spray_application_tenantId_idx" ON "spray_application"("tenantId");
CREATE INDEX "spray_application_tenantId_vineyardId_startedAt_idx" ON "spray_application"("tenantId", "vineyardId", "startedAt");
CREATE INDEX "spray_application_tenantId_status_idx" ON "spray_application"("tenantId", "status");

ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_vineyard_fkey" FOREIGN KEY ("tenantId", "vineyardId") REFERENCES "vineyard"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- composite self-FKs on the supersession chain (council C9 — no dangling, no repointed chain)
ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_supersedes_fkey" FOREIGN KEY ("tenantId", "supersedesApplicationId") REFERENCES "spray_application"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spray_application" ADD CONSTRAINT "spray_application_supersededBy_fkey" FOREIGN KEY ("tenantId", "supersededByApplicationId") REFERENCES "spray_application"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spray_application" ADD CONSTRAINT "sa_finish_after_start" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_wind_deg_range" CHECK ("windDirectionDeg" IS NULL OR ("windDirectionDeg" >= 0 AND "windDirectionDeg" <= 359));
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_rh_range" CHECK ("relHumidityPct" IS NULL OR ("relHumidityPct" >= 0 AND "relHumidityPct" <= 100));
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_ph_range" CHECK ("sprayWaterPh" IS NULL OR ("sprayWaterPh" >= 0 AND "sprayWaterPh" <= 14));
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_volume_nonneg" CHECK ("sprayVolumePerHaL" IS NULL OR "sprayVolumePerHaL" >= 0);
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_speed_nonneg" CHECK ("groundSpeedKph" IS NULL OR "groundSpeedKph" >= 0);
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_tank_nonneg" CHECK ("tankVolumeL" IS NULL OR "tankVolumeL" >= 0);
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_carrier_nonneg" CHECK ("carrierWaterVolumeL" IS NULL OR "carrierWaterVolumeL" >= 0);
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_wind_nonneg" CHECK ("windSpeedKph" IS NULL OR "windSpeedKph" >= 0);
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_revision_pos" CHECK ("revision" >= 1);
-- a correction successor names its kind AND its predecessor, together or not at all
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_correction_pair" CHECK (("correctionKind" IS NULL) = ("supersedesApplicationId" IS NULL));
-- SUPERSEDED ⇔ the successor pointer is set (bookkeeping written in the same tx)
ALTER TABLE "spray_application" ADD CONSTRAINT "sa_superseded_pair" CHECK (("status" = 'SUPERSEDED') = ("supersededByApplicationId" IS NOT NULL));

-- ─────────────────────────────── 3) spray_material_line ───────────────────────────────
CREATE TABLE "spray_material_line" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "epaRegistrationNumber" TEXT,
    "tenantProductRef" TEXT,
    "productIdentitySource" "SprayProductIdentitySource" NOT NULL,
    "materialRole" "SprayMaterialRole" NOT NULL,
    "adjuvantClass" "SprayAdjuvantClass",
    "quantityEntered" DECIMAL(18,8) NOT NULL,
    "quantityUnit" "SprayQuantityUnit" NOT NULL,
    "quantityBasis" "SprayQuantityBasis" NOT NULL,
    "quantityCanonical" DECIMAL(18,8) NOT NULL,
    "quantityDimension" "SprayQuantityDimension" NOT NULL,
    "enteredReiHours" INTEGER,
    "enteredPhiDays" INTEGER,
    "enteredActiveIngredient" TEXT,
    "snapshotPhiDays" INTEGER,
    "snapshotReiHours" INTEGER,
    "snapshotRainfastHours" DECIMAL(10,2),
    "snapshotMobilityClass" "SprayMobilityClass",
    "snapshotResistanceGroups" TEXT[],
    "resistanceGroupsKnown" BOOLEAN NOT NULL DEFAULT false,
    "snapshotActiveIngredientKeys" TEXT[],
    "activeIngredientsKnown" BOOLEAN NOT NULL DEFAULT false,
    "snapshotActiveIngredients" JSONB,
    "factsRevision" INTEGER,
    "factsAsOf" TIMESTAMP(3),
    "factsSource" "SprayFactsSource" NOT NULL DEFAULT 'NONE',
    "factsCompleteness" "SprayFactsCompleteness" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spray_material_line_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spray_material_line_tenantId_id_key" ON "spray_material_line"("tenantId", "id");
ALTER TABLE "spray_material_line" ADD CONSTRAINT "spray_material_line_tenantId_id_key" UNIQUE USING INDEX "spray_material_line_tenantId_id_key";
CREATE UNIQUE INDEX "spray_material_line_tenantId_applicationId_lineNo_key" ON "spray_material_line"("tenantId", "applicationId", "lineNo");
-- application-scoped identity: the mix-order FK target (council C10)
CREATE UNIQUE INDEX "spray_material_line_tenantId_applicationId_id_key" ON "spray_material_line"("tenantId", "applicationId", "id");
ALTER TABLE "spray_material_line" ADD CONSTRAINT "spray_material_line_tenantId_applicationId_id_key" UNIQUE USING INDEX "spray_material_line_tenantId_applicationId_id_key";
CREATE INDEX "spray_material_line_tenantId_idx" ON "spray_material_line"("tenantId");
CREATE INDEX "spray_material_line_tenantId_applicationId_idx" ON "spray_material_line"("tenantId", "applicationId");
CREATE INDEX "spray_material_line_tenantId_epaRegistrationNumber_idx" ON "spray_material_line"("tenantId", "epaRegistrationNumber");
CREATE INDEX "spray_material_line_tenantId_factsCompleteness_idx" ON "spray_material_line"("tenantId", "factsCompleteness");
-- the rotation-budget and residue read paths (council C12)
CREATE INDEX "sml_resistance_groups_gin" ON "spray_material_line" USING GIN ("snapshotResistanceGroups");
CREATE INDEX "sml_ai_keys_gin" ON "spray_material_line" USING GIN ("snapshotActiveIngredientKeys");

ALTER TABLE "spray_material_line" ADD CONSTRAINT "spray_material_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spray_material_line" ADD CONSTRAINT "spray_material_line_application_fkey" FOREIGN KEY ("tenantId", "applicationId") REFERENCES "spray_application"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_adjuvant_role" CHECK ("adjuvantClass" IS NULL OR "materialRole" = 'ADJUVANT');
-- rule §3.6 at the database (council C7): an empty array can never claim known = true
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_rg_known_nonempty" CHECK (NOT "resistanceGroupsKnown" OR cardinality("snapshotResistanceGroups") > 0);
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_ai_known_nonempty" CHECK (NOT "activeIngredientsKnown" OR cardinality("snapshotActiveIngredientKeys") > 0);
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_known_requires_flags" CHECK ("factsCompleteness" <> 'KNOWN' OR ("resistanceGroupsKnown" AND "activeIngredientsKnown"));
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_lineno_pos" CHECK ("lineNo" >= 1);
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_quantity_pos" CHECK ("quantityEntered" > 0 AND "quantityCanonical" > 0);
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_rainfast_nonneg" CHECK ("snapshotRainfastHours" IS NULL OR "snapshotRainfastHours" >= 0);
ALTER TABLE "spray_material_line" ADD CONSTRAINT "sml_phi_rei_nonneg" CHECK (
  ("enteredReiHours" IS NULL OR "enteredReiHours" >= 0) AND ("enteredPhiDays" IS NULL OR "enteredPhiDays" >= 0)
  AND ("snapshotReiHours" IS NULL OR "snapshotReiHours" >= 0) AND ("snapshotPhiDays" IS NULL OR "snapshotPhiDays" >= 0));

-- ─────────────────────────────── 4) spray_mix_order_line ───────────────────────────────
CREATE TABLE "spray_mix_order_line" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "materialDescription" TEXT NOT NULL,
    "amountPerTankEntered" DECIMAL(18,8),
    "amountPerTankUnit" "SprayQuantityUnit",
    "materialLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spray_mix_order_line_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spray_mix_order_line_tenantId_id_key" ON "spray_mix_order_line"("tenantId", "id");
ALTER TABLE "spray_mix_order_line" ADD CONSTRAINT "spray_mix_order_line_tenantId_id_key" UNIQUE USING INDEX "spray_mix_order_line_tenantId_id_key";
CREATE UNIQUE INDEX "spray_mix_order_line_tenantId_applicationId_sequence_key" ON "spray_mix_order_line"("tenantId", "applicationId", "sequence");
CREATE INDEX "spray_mix_order_line_tenantId_idx" ON "spray_mix_order_line"("tenantId");
CREATE INDEX "spray_mix_order_line_tenantId_applicationId_idx" ON "spray_mix_order_line"("tenantId", "applicationId");

ALTER TABLE "spray_mix_order_line" ADD CONSTRAINT "spray_mix_order_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spray_mix_order_line" ADD CONSTRAINT "spray_mix_order_line_application_fkey" FOREIGN KEY ("tenantId", "applicationId") REFERENCES "spray_application"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- APPLICATION-scoped material-line FK (council C10 — cannot point at another pass's line).
-- ON DELETE NO ACTION, deviating from the plan's SET NULL deliberately: a material line is only
-- ever deleted via the application CASCADE (append-only otherwise), which deletes this row too in
-- the same statement — and SET NULL would fire the immutability trigger mid-purge.
ALTER TABLE "spray_mix_order_line" ADD CONSTRAINT "spray_mix_order_line_material_fkey" FOREIGN KEY ("tenantId", "applicationId", "materialLineId") REFERENCES "spray_material_line"("tenantId", "applicationId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "spray_mix_order_line" ADD CONSTRAINT "smol_sequence_pos" CHECK ("sequence" >= 1);
ALTER TABLE "spray_mix_order_line" ADD CONSTRAINT "smol_amount_nonneg" CHECK ("amountPerTankEntered" IS NULL OR "amountPerTankEntered" >= 0);

-- ─────────────────────────────── 5) spray_block_line ───────────────────────────────
CREATE TABLE "spray_block_line" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "segmentNo" INTEGER NOT NULL DEFAULT 1,
    "blockLabelSnapshot" TEXT NOT NULL,
    "treatedAreaHa" DECIMAL(18,8) NOT NULL,
    "treatedAreaSource" "SprayAreaSource" NOT NULL,
    "treatedAreaNote" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "tankBatchRef" TEXT,
    "estTanks" DECIMAL(10,2),
    "tanksUsed" DECIMAL(10,2),
    "volumeUsedL" DECIMAL(18,8),
    "computedVolumePerHaL" DECIMAL(18,8),
    "rateBasis" "SprayRateBasis" NOT NULL,
    "depositionMethod" "SprayDepositionMethod",
    "depositionAdequate" BOOLEAN,
    "depositionCheckedAt" TIMESTAMP(3),
    "depositionNote" TEXT,
    "driedBeforeRainDerived" BOOLEAN,
    "driedBeforeRainBasis" "SprayDriedBasis",
    "driedBeforeRainDerivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spray_block_line_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spray_block_line_tenantId_id_key" ON "spray_block_line"("tenantId", "id");
ALTER TABLE "spray_block_line" ADD CONSTRAINT "spray_block_line_tenantId_id_key" UNIQUE USING INDEX "spray_block_line_tenantId_id_key";
-- segmentNo in the key: the same block can appear twice in one pass (council G7)
CREATE UNIQUE INDEX "spray_block_line_tenant_app_block_segment_key" ON "spray_block_line"("tenantId", "applicationId", "blockId", "segmentNo");
CREATE INDEX "spray_block_line_tenantId_idx" ON "spray_block_line"("tenantId");
CREATE INDEX "spray_block_line_tenantId_blockId_startedAt_idx" ON "spray_block_line"("tenantId", "blockId", "startedAt");
CREATE INDEX "spray_block_line_tenantId_applicationId_idx" ON "spray_block_line"("tenantId", "applicationId");

ALTER TABLE "spray_block_line" ADD CONSTRAINT "spray_block_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spray_block_line" ADD CONSTRAINT "spray_block_line_application_fkey" FOREIGN KEY ("tenantId", "applicationId") REFERENCES "spray_application"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- a block with spray history cannot be deleted (matches BrixLog posture)
ALTER TABLE "spray_block_line" ADD CONSTRAINT "spray_block_line_block_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spray_block_line" ADD CONSTRAINT "sbl_area_pos" CHECK ("treatedAreaHa" > 0);
ALTER TABLE "spray_block_line" ADD CONSTRAINT "sbl_finish_after_start" CHECK ("finishedAt" IS NULL OR "startedAt" IS NULL OR "finishedAt" >= "startedAt");
ALTER TABLE "spray_block_line" ADD CONSTRAINT "sbl_segment_pos" CHECK ("segmentNo" >= 1);
ALTER TABLE "spray_block_line" ADD CONSTRAINT "sbl_tanks_nonneg" CHECK (("estTanks" IS NULL OR "estTanks" >= 0) AND ("tanksUsed" IS NULL OR "tanksUsed" >= 0));
ALTER TABLE "spray_block_line" ADD CONSTRAINT "sbl_volume_nonneg" CHECK (("volumeUsedL" IS NULL OR "volumeUsedL" >= 0) AND ("computedVolumePerHaL" IS NULL OR "computedVolumePerHaL" >= 0));

-- ─────────────────────────────── 6) spray_drying_override ───────────────────────────────
CREATE TABLE "spray_drying_override" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "blockLineId" TEXT NOT NULL,
    "value" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spray_drying_override_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spray_drying_override_tenantId_id_key" ON "spray_drying_override"("tenantId", "id");
ALTER TABLE "spray_drying_override" ADD CONSTRAINT "spray_drying_override_tenantId_id_key" UNIQUE USING INDEX "spray_drying_override_tenantId_id_key";
CREATE INDEX "spray_drying_override_tenantId_idx" ON "spray_drying_override"("tenantId");
CREATE INDEX "spray_drying_override_tenantId_blockLineId_enteredAt_idx" ON "spray_drying_override"("tenantId", "blockLineId", "enteredAt");

ALTER TABLE "spray_drying_override" ADD CONSTRAINT "spray_drying_override_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spray_drying_override" ADD CONSTRAINT "spray_drying_override_blockLine_fkey" FOREIGN KEY ("tenantId", "blockLineId") REFERENCES "spray_block_line"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────── 7) planned_harvest_date_event ───────────────────────────────
CREATE TABLE "planned_harvest_date_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "vintageYear" INTEGER NOT NULL,
    "harvestPassLabel" TEXT NOT NULL DEFAULT 'main',
    "plannedDate" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "PlannedHarvestStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "planned_harvest_date_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "planned_harvest_date_event_tenantId_id_key" ON "planned_harvest_date_event"("tenantId", "id");
ALTER TABLE "planned_harvest_date_event" ADD CONSTRAINT "planned_harvest_date_event_tenantId_id_key" UNIQUE USING INDEX "planned_harvest_date_event_tenantId_id_key";
CREATE UNIQUE INDEX "phde_tenant_block_vintage_pass_version_key" ON "planned_harvest_date_event"("tenantId", "blockId", "vintageYear", "harvestPassLabel", "version");
-- at most ONE open row per block-vintage-pass; ZERO open rows = "no planned date" (KD-8 / council C3)
CREATE UNIQUE INDEX "phde_one_open_row" ON "planned_harvest_date_event"("tenantId", "blockId", "vintageYear", "harvestPassLabel") WHERE "effectiveTo" IS NULL;
CREATE INDEX "planned_harvest_date_event_tenantId_idx" ON "planned_harvest_date_event"("tenantId");
CREATE INDEX "phde_point_in_time_idx" ON "planned_harvest_date_event"("tenantId", "blockId", "vintageYear", "effectiveFrom");
CREATE INDEX "planned_harvest_date_event_tenantId_enteredAt_idx" ON "planned_harvest_date_event"("tenantId", "enteredAt");

ALTER TABLE "planned_harvest_date_event" ADD CONSTRAINT "planned_harvest_date_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planned_harvest_date_event" ADD CONSTRAINT "planned_harvest_date_event_block_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planned_harvest_date_event" ADD CONSTRAINT "phde_version_pos" CHECK ("version" >= 1);
ALTER TABLE "planned_harvest_date_event" ADD CONSTRAINT "phde_interval_order" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "planned_harvest_date_event" ADD CONSTRAINT "phde_vintage_sane" CHECK ("vintageYear" >= 1900 AND "vintageYear" <= 2200);

-- ─────────────────────────────── 8) legacy_spray_mapping ───────────────────────────────
CREATE TABLE "legacy_spray_mapping" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "epaRegistrationNumber" TEXT,
    "productName" TEXT,
    "status" "LegacySprayMappingStatus" NOT NULL DEFAULT 'SUGGESTED',
    "suggestionBasis" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedByEmail" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "legacy_spray_mapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legacy_spray_mapping_tenantId_id_key" ON "legacy_spray_mapping"("tenantId", "id");
ALTER TABLE "legacy_spray_mapping" ADD CONSTRAINT "legacy_spray_mapping_tenantId_id_key" UNIQUE USING INDEX "legacy_spray_mapping_tenantId_id_key";
CREATE UNIQUE INDEX "legacy_spray_mapping_tenantId_normalizedName_key" ON "legacy_spray_mapping"("tenantId", "normalizedName");
CREATE INDEX "legacy_spray_mapping_tenantId_idx" ON "legacy_spray_mapping"("tenantId");
ALTER TABLE "legacy_spray_mapping" ADD CONSTRAINT "legacy_spray_mapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────── 9) RLS (Phase-12 / TENANT-1 pattern) ───────────────────────────────
ALTER TABLE "spray_application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spray_application" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spray_application" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "spray_application" TO app_rls;

ALTER TABLE "spray_material_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spray_material_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spray_material_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "spray_material_line" TO app_rls;

ALTER TABLE "spray_mix_order_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spray_mix_order_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spray_mix_order_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "spray_mix_order_line" TO app_rls;

ALTER TABLE "spray_block_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spray_block_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spray_block_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "spray_block_line" TO app_rls;

ALTER TABLE "spray_drying_override" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spray_drying_override" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "spray_drying_override" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "spray_drying_override" TO app_rls;

ALTER TABLE "planned_harvest_date_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planned_harvest_date_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "planned_harvest_date_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "planned_harvest_date_event" TO app_rls;

ALTER TABLE "legacy_spray_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legacy_spray_mapping" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "legacy_spray_mapping" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "legacy_spray_mapping" TO app_rls;

-- ─────────────────────────────── 10) Immutability triggers (KD-1 / KD-2 / council C5, C9, C15) ───────────────────────────────
-- BEFORE UPDATE: raise unless every changed column is on the per-table bookkeeping allowlist
-- (passed as trigger args). Also: the supersededByApplicationId pointer is writable ONCE
-- (NULL -> value) and can never be repointed (council C9).
CREATE OR REPLACE FUNCTION spray_reject_content_mutation() RETURNS trigger AS $$
DECLARE
  allowed text[] := COALESCE(TG_ARGV, ARRAY[]::text[]);
  changed_col text;
BEGIN
  IF TG_TABLE_NAME = 'spray_application'
     AND OLD."supersededByApplicationId" IS NOT NULL
     AND NEW."supersededByApplicationId" IS DISTINCT FROM OLD."supersededByApplicationId" THEN
    RAISE EXCEPTION 'spray append-only: supersededByApplicationId is writable once (NULL -> value) and can never be repointed (KD-1/C9)';
  END IF;
  FOR changed_col IN
    SELECT o.key
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n ON n.key = o.key
    WHERE o.value IS DISTINCT FROM n.value
  LOOP
    IF NOT (changed_col = ANY (allowed)) THEN
      RAISE EXCEPTION 'spray append-only: %.% is immutable content — correct by appending a new revision (KD-1)', TG_TABLE_NAME, changed_col;
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- BEFORE DELETE: refuse unless BOTH the named purge GUC is on AND the connected role is not
-- app_rls (council C15 — the flag alone is settable by the app role). QA/verify teardown only.
CREATE OR REPLACE FUNCTION spray_reject_delete() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_spray_purge', true) = 'on' AND current_user <> 'app_rls' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'spray append-only: DELETE refused on % — a void is a successor row (KD-1); only an owner-context teardown with app.allow_spray_purge=on may purge (C15)', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER spray_application_no_update BEFORE UPDATE ON "spray_application"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation('status', 'supersededByApplicationId');
CREATE TRIGGER spray_application_no_delete BEFORE DELETE ON "spray_application"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

CREATE TRIGGER spray_material_line_no_update BEFORE UPDATE ON "spray_material_line"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation();
CREATE TRIGGER spray_material_line_no_delete BEFORE DELETE ON "spray_material_line"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

CREATE TRIGGER spray_mix_order_line_no_update BEFORE UPDATE ON "spray_mix_order_line"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation();
CREATE TRIGGER spray_mix_order_line_no_delete BEFORE DELETE ON "spray_mix_order_line"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

-- driedBeforeRain* are DERIVED (KD-2) — recomputable at will, so allowlisted.
CREATE TRIGGER spray_block_line_no_update BEFORE UPDATE ON "spray_block_line"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation('driedBeforeRainDerived', 'driedBeforeRainBasis', 'driedBeforeRainDerivedAt');
CREATE TRIGGER spray_block_line_no_delete BEFORE DELETE ON "spray_block_line"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

-- Overrides allowlist NOTHING (council C5) — no column is ever updated.
CREATE TRIGGER spray_drying_override_no_update BEFORE UPDATE ON "spray_drying_override"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation();
CREATE TRIGGER spray_drying_override_no_delete BEFORE DELETE ON "spray_drying_override"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

-- Closing an interval row is bookkeeping; everything else is content (council C5).
CREATE TRIGGER planned_harvest_date_event_no_update BEFORE UPDATE ON "planned_harvest_date_event"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation('effectiveTo', 'status');
CREATE TRIGGER planned_harvest_date_event_no_delete BEFORE DELETE ON "planned_harvest_date_event"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

-- ─────────────────────────────── 11) Self-verify: RLS + policy + triggers actually landed ───────────────────────────────
DO $$
DECLARE
  t text;
  append_only text[] := ARRAY['spray_application', 'spray_material_line', 'spray_mix_order_line', 'spray_block_line', 'spray_drying_override', 'planned_harvest_date_event'];
BEGIN
  FOREACH t IN ARRAY ARRAY['spray_application', 'spray_material_line', 'spray_mix_order_line', 'spray_block_line', 'spray_drying_override', 'planned_harvest_date_event', 'legacy_spray_mapping'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY append_only LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE c.relname = t AND g.tgname = t || '_no_update') THEN
      RAISE EXCEPTION 'append-only UPDATE trigger missing on %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE c.relname = t AND g.tgname = t || '_no_delete') THEN
      RAISE EXCEPTION 'append-only DELETE trigger missing on %', t;
    END IF;
  END LOOP;
END
$$;
