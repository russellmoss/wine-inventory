-- Spray Intelligence S2b — the PRODUCT FACTS master (schema-first slice, plan Units 1-5).
-- docs/spray_assistant/phases/S2b-product-facts-master-plan.md (v2.3, council-reconciled 2026-07-26)
--
-- HAND-AUTHORED, deliberately. `prisma migrate diff --from-url` against this database is NOT safe
-- here: the repo's cross-table FKs are RAW-SQL composite (tenantId, refId) -> (tenantId, id) with no
-- Prisma @relation (K11), so Prisma cannot see them and the generated diff proposes DROPping tenant
-- FK constraints across the whole schema. Author the SQL, then `migrate deploy`.
--
-- Everything here is ADDITIVE: new types, new tables, new nullable columns, new indexes. No DROP,
-- no TRUNCATE, no SET NOT NULL on an existing column, no ALTER TYPE.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums. All CREATE (never ALTER) so the Windows enum rule — an isolated ALTER TYPE must land before
-- any dependent default — does not apply.
-- ─────────────────────────────────────────────────────────────────────────────

-- KD-11: the unit of provenance, freshness, and tenant override.
CREATE TYPE "PesticideFactGroup" AS ENUM ('REGULATORY', 'AGRONOMIC');

CREATE TYPE "PesticideAdjuvantRequirement" AS ENUM ('REQUIRED', 'OPTIONAL', 'PROHIBITED', 'UNSPECIFIED');

CREATE TYPE "PesticideSeparationTargetKind" AS ENUM ('ACTIVE_INGREDIENT', 'AGRONOMIC_CLASS', 'PRODUCT');

CREATE TYPE "PesticideSeparationDirection" AS ENUM ('TARGET_AFTER_SUBJECT', 'TARGET_BEFORE_SUBJECT');

CREATE TYPE "PesticideConditionKind" AS ENUM ('MAX_TEMP_F', 'NO_WET_FOLIAGE', 'NO_STRESSED_VINES', 'NO_FREEZE_WITHIN_H', 'TANK_MIX_PROHIBITED', 'MIXING_ORDER', 'ADJUVANT_REQUIRED', 'ADJUVANT_PROHIBITED');

CREATE TYPE "PesticideConditionSeverity" AS ENUM ('HARD_STOP', 'CAUTION');

-- KD-12 / council G2: REI varies by TASK. 12 h to scout, 48 h for tying and leaf pulling. S7a's gate
-- is "REI collides correctly with a scheduled hand-labor work order" and hand labor IS the long one.
CREATE TYPE "PesticideEntryActivity" AS ENUM ('GENERAL', 'SCOUTING', 'HAND_LABOR', 'HARVESTING', 'IRRIGATION');

-- ─────────────────────────────────────────────────────────────────────────────
-- Unit 2 — the curated facts master. TENANT-GLOBAL reference data, same posture as the S2 pesticide
-- tables: no tenantId, no RLS, registered in all three GLOBAL_MODELS mirrors. Entitlement stays a
-- SERVICE-layer check in src/lib/pesticide/lookup.ts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "pesticide_product_facts" (
    "id" TEXT NOT NULL,
    "epaRegNumber" TEXT NOT NULL,
    "factGroup" "PesticideFactGroup" NOT NULL,
    "labelVersionKey" TEXT NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "worstCasePhiDays" INTEGER,
    "worstCaseReiHours" INTEGER,
    "minRepeatIntervalDays" INTEGER,
    "maxApplicationsPerSeason" INTEGER,
    "maxAiPerSeasonAmount" DECIMAL(12,4),
    "maxAiPerSeasonUnit" TEXT,
    "requiresBulletinCheck" BOOLEAN,
    "adjuvantRequirement" "PesticideAdjuvantRequirement",
    "rainfastHours" INTEGER,
    "mobilityClass" "SprayMobilityClass",
    "agronomicClass" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceAsOf" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3) NOT NULL,
    "reviewNote" TEXT,
    "revisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pesticide_product_facts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pesticide_product_facts_epaRegNumber_factGroup_idx" ON "pesticide_product_facts"("epaRegNumber", "factGroup");
CREATE INDEX "pesticide_product_facts_factGroup_reviewDueAt_idx" ON "pesticide_product_facts"("factGroup", "reviewDueAt");
CREATE INDEX "pesticide_product_facts_revisionId_idx" ON "pesticide_product_facts"("revisionId");

-- ⭐ COUNCIL C1 — THE RESOLUTION GUARANTEE. The frozen `ProductFactsKey`
-- (src/lib/spray/product-facts-port.ts) carries NO version selector, so if two ACTIVE rows existed
-- for one (reg, group) then `resolveMany` would have no deterministic answer and "pick the latest"
-- would destroy the point of KD-1. Resolution is single-row BY CONSTRUCTION. Prisma cannot express a
-- filtered unique, so this is raw SQL and must not be removed by a later `prisma format`/diff.
CREATE UNIQUE INDEX "pesticide_product_facts_active_one_per_reg_group"
  ON "pesticide_product_facts"("epaRegNumber", "factGroup")
  WHERE "supersededAt" IS NULL;

-- ── KD-12: PHI and REI are CONDITIONAL, not scalars ──────────────────────────
CREATE TABLE "pesticide_product_rei_condition" (
    "id" TEXT NOT NULL,
    "factsId" TEXT NOT NULL,
    "activity" "PesticideEntryActivity" NOT NULL,
    "hours" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "pesticide_product_rei_condition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pesticide_product_rei_condition_factsId_activity_key" ON "pesticide_product_rei_condition"("factsId", "activity");
CREATE INDEX "pesticide_product_rei_condition_factsId_idx" ON "pesticide_product_rei_condition"("factsId");

CREATE TABLE "pesticide_product_phi_condition" (
    "id" TEXT NOT NULL,
    "factsId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pesticide_product_phi_condition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pesticide_product_phi_condition_factsId_idx" ON "pesticide_product_phi_condition"("factsId");

-- ── KD-2: separation rules are DIRECTION-SPECIFIC and asserted BY a subject ──
CREATE TABLE "pesticide_separation_rule" (
    "id" TEXT NOT NULL,
    "factsId" TEXT NOT NULL,
    "targetKind" "PesticideSeparationTargetKind" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "direction" "PesticideSeparationDirection" NOT NULL,
    "minDays" INTEGER NOT NULL,
    "fruitPresentOnly" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,
    CONSTRAINT "pesticide_separation_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pesticide_separation_rule_factsId_idx" ON "pesticide_separation_rule"("factsId");
CREATE INDEX "pesticide_separation_rule_targetKind_targetKey_idx" ON "pesticide_separation_rule"("targetKind", "targetKey");

CREATE TABLE "pesticide_product_condition" (
    "id" TEXT NOT NULL,
    "factsId" TEXT NOT NULL,
    "conditionKind" "PesticideConditionKind" NOT NULL,
    "threshold" DECIMAL(10,2),
    "thresholdUnit" TEXT,
    "severity" "PesticideConditionSeverity" NOT NULL,
    "appliesWhen" TEXT,
    "detail" TEXT,
    CONSTRAINT "pesticide_product_condition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pesticide_product_condition_factsId_idx" ON "pesticide_product_condition"("factsId");
CREATE INDEX "pesticide_product_condition_conditionKind_idx" ON "pesticide_product_condition"("conditionKind");

-- These four ARE Prisma @relation FKs (parent and child are both global, so there is no tenant
-- component and no K11 composite-FK concern).
ALTER TABLE "pesticide_product_rei_condition" ADD CONSTRAINT "pesticide_product_rei_condition_factsId_fkey" FOREIGN KEY ("factsId") REFERENCES "pesticide_product_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pesticide_product_phi_condition" ADD CONSTRAINT "pesticide_product_phi_condition_factsId_fkey" FOREIGN KEY ("factsId") REFERENCES "pesticide_product_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pesticide_separation_rule" ADD CONSTRAINT "pesticide_separation_rule_factsId_fkey" FOREIGN KEY ("factsId") REFERENCES "pesticide_product_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pesticide_product_condition" ADD CONSTRAINT "pesticide_product_condition_factsId_fkey" FOREIGN KEY ("factsId") REFERENCES "pesticide_product_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Auto-granted by ALTER DEFAULT PRIVILEGES (20260701000900_app_rls_role); explicit for the same
-- belt-and-braces reason S2's migration gives.
GRANT SELECT, INSERT, UPDATE, DELETE ON "pesticide_product_facts", "pesticide_product_rei_condition",
  "pesticide_product_phi_condition", "pesticide_separation_rule", "pesticide_product_condition" TO app_rls;

-- ─────────────────────────────────────────────────────────────────────────────
-- Unit 5 — the GROWER-SUPPLIED override. TENANT-SCOPED, full AGENTS.md Phase-12 checklist.
-- This is the one S2b table that is NOT global. Built once, serves both the non-US tenant with no
-- registry at all (rule §3.9, Bhutan is LIVE) and the US grower overriding an unresolvable product
-- (council P1).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "tenant_product_facts" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "epaRegistrationNumber" TEXT,
    "factGroup" "PesticideFactGroup" NOT NULL,
    "worstCasePhiDays" INTEGER,
    "worstCaseReiHours" INTEGER,
    "minRepeatIntervalDays" INTEGER,
    "maxApplicationsPerSeason" INTEGER,
    "rainfastHours" INTEGER,
    "mobilityClass" "SprayMobilityClass",
    "agronomicClass" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adjuvantRequirement" "PesticideAdjuvantRequirement",
    "enteredBy" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_product_facts_pkey" PRIMARY KEY ("id")
);

-- Step 4: per-tenant unique. Step 5: the composite (tenantId, id) cross-tenant FK target (K11).
CREATE UNIQUE INDEX "tenant_product_facts_tenantId_productRef_factGroup_key" ON "tenant_product_facts"("tenantId", "productRef", "factGroup");
CREATE UNIQUE INDEX "tenant_product_facts_tenantId_id_key" ON "tenant_product_facts"("tenantId", "id");
CREATE INDEX "tenant_product_facts_tenantId_idx" ON "tenant_product_facts"("tenantId");
CREATE INDEX "tenant_product_facts_tenantId_epaRegistrationNumber_idx" ON "tenant_product_facts"("tenantId", "epaRegistrationNumber");

-- Step 2: FK -> organization(id) ON DELETE RESTRICT.
ALTER TABLE "tenant_product_facts" ADD CONSTRAINT "tenant_product_facts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 6: RLS, fail-closed, USING *and* WITH CHECK.
ALTER TABLE "tenant_product_facts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_product_facts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_product_facts" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_product_facts" TO app_rls;

-- ─────────────────────────────────────────────────────────────────────────────
-- Unit 1 — jurisdiction (KD-9). Explicit, human-confirmed, never defaulted, never GPS-derived.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "vineyard_detail" ADD COLUMN "regulatoryCountry" TEXT;
ALTER TABLE "vineyard_detail" ADD COLUMN "regulatoryState" TEXT;
ALTER TABLE "vineyard_detail" ADD COLUMN "jurisdictionConfirmedAt" TIMESTAMP(3);
ALTER TABLE "vineyard_detail" ADD COLUMN "jurisdictionConfirmedBy" TEXT;

-- Council C3 — the jurisdiction SNAPSHOT, per BLOCK LINE, written at record time. A pass spans blocks
-- in different vineyards (so one application-level jurisdiction is wrong for some lines), and
-- vineyard_detail is MUTABLE (so reading it later would let an admin edit silently change what a past
-- decision meant — rule §3.8). Downstream legality reads consume THIS, never the live vineyard row.
ALTER TABLE "spray_block_line" ADD COLUMN "snapshotJurisdictionCountry" TEXT;
ALTER TABLE "spray_block_line" ADD COLUMN "snapshotJurisdictionState" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Unit 4 — the fifth source + the fact-group provenance axis.
-- Axis A: the curated facts artifact moves on its own cadence (a human commits it), so per the
--   S2<->S3a contract's change rule it gets its OWN component instead of overloading one of S2's four.
-- Axis B: WHICH source each fact group came from and how fresh it was AT WRITE TIME. A DIFFERENT
--   question from "which registry generation" — conflating the two is exactly how the
--   scalar-vs-composite seam defect happened, so they stay separate columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- Guard: the additive-now bet is that this table is still empty. If it is not, the NOT NULL DEFAULTs
-- below would silently stamp 'NONE'/false onto real regulatory records, which is a provenance lie.
DO $$
DECLARE
  populated bigint;
BEGIN
  SELECT count(*) INTO populated FROM "spray_material_line";
  IF populated > 0 THEN
    RAISE EXCEPTION 'spray_material_line has % row(s) — S2b Unit 4 assumes zero. Backfill the fact-group provenance columns explicitly instead of defaulting them.', populated;
  END IF;
END $$;

ALTER TABLE "spray_material_line" ADD COLUMN "factsProductFactsArtifactSha256" TEXT;
ALTER TABLE "spray_material_line" ADD COLUMN "factsProductFactsAsOf" TIMESTAMP(3);

ALTER TABLE "spray_material_line" ADD COLUMN "regulatorySource" "SprayFactsSource" NOT NULL DEFAULT 'NONE';
ALTER TABLE "spray_material_line" ADD COLUMN "regulatoryAsOf" TIMESTAMP(3);
ALTER TABLE "spray_material_line" ADD COLUMN "regulatoryStaleAtWrite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "spray_material_line" ADD COLUMN "agronomicSource" "SprayFactsSource" NOT NULL DEFAULT 'NONE';
ALTER TABLE "spray_material_line" ADD COLUMN "agronomicAsOf" TIMESTAMP(3);
ALTER TABLE "spray_material_line" ADD COLUMN "agronomicStaleAtWrite" BOOLEAN NOT NULL DEFAULT false;
