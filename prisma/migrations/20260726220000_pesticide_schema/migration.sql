-- Spray S2 Unit 1: pesticide registration + resistance master (schema). GLOBAL reference tables
-- (like fx_rate and the Plan-079 knowledge corpus) — NO tenantId, NO RLS; all eight models are listed
-- in GLOBAL_MODELS (src/lib/tenant/models.ts), mirrored in scripts/verify-tenant-isolation.ts and
-- test/tenant-context.test.ts. Entitlement is enforced at the SERVICE layer (src/lib/pesticide/lookup.ts
-- checks the `epa-pesticide` subscription, failing closed) — the paired _pesticide_rls migration
-- documents why there is no policy. Hand-written (not migrate dev): the partial unique indexes and the
-- CHECK constraints below are inexpressible in Prisma's DSL (SpatialStyle precedent). app_rls DML is
-- auto-granted by ALTER DEFAULT PRIVILEGES (20260701000900_app_rls_role); explicit GRANTs are
-- belt-and-braces. All enums are CREATE TYPE only — no ALTER TYPE (Windows enum rule trivially met).

-- CreateEnum
CREATE TYPE "PesticideRevisionStatus" AS ENUM ('RUNNING', 'FAILED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PesticideSourceStatus" AS ENUM ('ACTIVE', 'WITHDRAWN_FROM_SOURCE');

-- CreateEnum
CREATE TYPE "PesticideSiteModifier" AS ENUM ('BEARING', 'NON_BEARING', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "PesticideStateRegStatus" AS ENUM ('REGISTERED', 'NOT_REGISTERED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResistanceResolution" AS ENUM ('CODED', 'NO_CODE_EXISTS', 'GAP');

-- CreateEnum
CREATE TYPE "ResistanceSiteType" AS ENUM ('SINGLE', 'MULTI', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResistanceSubjectKind" AS ENUM ('ACTIVE_INGREDIENT', 'PRODUCT');

-- CreateEnum
CREATE TYPE "ResistanceScheme" AS ENUM ('FRAC', 'HRAC', 'IRAC');

-- CreateEnum
CREATE TYPE "ResistanceDerivedFrom" AS ENUM ('AI_KEYED_TABLE', 'PRODUCT_KEYED_TABLE', 'EXTENSION_PROSE', 'LABEL_SINGLE_AI', 'AI_ROLLUP');

-- CreateTable
CREATE TABLE "pesticide_data_revision" (
    "id" TEXT NOT NULL,
    "status" "PesticideRevisionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "apprilAsOf" TIMESTAMP(3),
    "cdprAsOf" TIMESTAMP(3),
    "resistanceArtifactSha256" TEXT,
    "summary" JSONB,

    CONSTRAINT "pesticide_data_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesticide_product" (
    "id" TEXT NOT NULL,
    "epaRegNumber" TEXT,
    "caRegNumber" TEXT,
    "productName" TEXT NOT NULL,
    "companyName" TEXT,
    "labelDate" TIMESTAMP(3),
    "registrationStatus" TEXT,
    "sourceStatus" "PesticideSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "labelNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pestCategoryRaw" TEXT,
    "lastSeenRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pesticide_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesticide_active_ingredient" (
    "id" TEXT NOT NULL,
    "pcCode" TEXT,
    "casNumber" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "parentActiveIngredientId" TEXT,
    "lastSeenRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pesticide_active_ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesticide_product_ingredient" (
    "productId" TEXT NOT NULL,
    "activeIngredientId" TEXT NOT NULL,
    "percent" DECIMAL(8,4),

    CONSTRAINT "pesticide_product_ingredient_pkey" PRIMARY KEY ("productId","activeIngredientId")
);

-- CreateTable
CREATE TABLE "pesticide_site_registration" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "siteCodeRaw" TEXT,
    "siteNameRaw" TEXT NOT NULL,
    "isGrape" BOOLEAN NOT NULL DEFAULT false,
    "siteModifier" "PesticideSiteModifier" NOT NULL DEFAULT 'UNSPECIFIED',
    "lastSeenRevisionId" TEXT,

    CONSTRAINT "pesticide_site_registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesticide_state_registration" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" "PesticideStateRegStatus" NOT NULL,
    "siteCode" TEXT NOT NULL DEFAULT '',
    "lastSeenRevisionId" TEXT,

    CONSTRAINT "pesticide_state_registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesticide_use_restriction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "counties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kind" TEXT NOT NULL,
    "exception" TEXT,
    "quote" TEXT NOT NULL,
    "lastSeenRevisionId" TEXT,

    CONSTRAINT "pesticide_use_restriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pesticide_resistance_assignment" (
    "id" TEXT NOT NULL,
    "subjectKind" "ResistanceSubjectKind" NOT NULL,
    "activeIngredientId" TEXT,
    "productId" TEXT,
    "scheme" "ResistanceScheme" NOT NULL,
    "resolution" "ResistanceResolution" NOT NULL,
    "codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "siteType" "ResistanceSiteType" NOT NULL,
    "derivedFrom" "ResistanceDerivedFrom" NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceAsOf" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "revisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pesticide_resistance_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pesticide_data_revision_status_startedAt_idx" ON "pesticide_data_revision"("status", "startedAt");

-- CreateIndex
CREATE INDEX "pesticide_product_lastSeenRevisionId_idx" ON "pesticide_product"("lastSeenRevisionId");

-- CreateIndex
CREATE INDEX "pesticide_active_ingredient_normalizedName_idx" ON "pesticide_active_ingredient"("normalizedName");

-- CreateIndex
CREATE INDEX "pesticide_active_ingredient_parentActiveIngredientId_idx" ON "pesticide_active_ingredient"("parentActiveIngredientId");

-- CreateIndex
CREATE INDEX "pesticide_active_ingredient_lastSeenRevisionId_idx" ON "pesticide_active_ingredient"("lastSeenRevisionId");

-- CreateIndex
CREATE INDEX "pesticide_product_ingredient_activeIngredientId_idx" ON "pesticide_product_ingredient"("activeIngredientId");

-- CreateIndex
CREATE INDEX "pesticide_site_registration_productId_isGrape_idx" ON "pesticide_site_registration"("productId", "isGrape");

-- CreateIndex
CREATE INDEX "pesticide_site_registration_lastSeenRevisionId_idx" ON "pesticide_site_registration"("lastSeenRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "pesticide_site_registration_productId_siteNameRaw_key" ON "pesticide_site_registration"("productId", "siteNameRaw");

-- CreateIndex
CREATE INDEX "pesticide_state_registration_productId_state_idx" ON "pesticide_state_registration"("productId", "state");

-- CreateIndex
CREATE INDEX "pesticide_state_registration_lastSeenRevisionId_idx" ON "pesticide_state_registration"("lastSeenRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "pesticide_state_registration_productId_state_siteCode_key" ON "pesticide_state_registration"("productId", "state", "siteCode");

-- CreateIndex
CREATE INDEX "pesticide_use_restriction_productId_state_idx" ON "pesticide_use_restriction"("productId", "state");

-- CreateIndex
CREATE INDEX "pesticide_use_restriction_lastSeenRevisionId_idx" ON "pesticide_use_restriction"("lastSeenRevisionId");

-- CreateIndex
CREATE INDEX "pesticide_resistance_assignment_activeIngredientId_idx" ON "pesticide_resistance_assignment"("activeIngredientId");

-- CreateIndex
CREATE INDEX "pesticide_resistance_assignment_productId_idx" ON "pesticide_resistance_assignment"("productId");

-- CreateIndex
CREATE INDEX "pesticide_resistance_assignment_revisionId_idx" ON "pesticide_resistance_assignment"("revisionId");

-- AddForeignKey
ALTER TABLE "pesticide_active_ingredient" ADD CONSTRAINT "pesticide_active_ingredient_parentActiveIngredientId_fkey" FOREIGN KEY ("parentActiveIngredientId") REFERENCES "pesticide_active_ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_product_ingredient" ADD CONSTRAINT "pesticide_product_ingredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pesticide_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_product_ingredient" ADD CONSTRAINT "pesticide_product_ingredient_activeIngredientId_fkey" FOREIGN KEY ("activeIngredientId") REFERENCES "pesticide_active_ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_site_registration" ADD CONSTRAINT "pesticide_site_registration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pesticide_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_state_registration" ADD CONSTRAINT "pesticide_state_registration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pesticide_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_use_restriction" ADD CONSTRAINT "pesticide_use_restriction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pesticide_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_resistance_assignment" ADD CONSTRAINT "pesticide_resistance_assignment_activeIngredientId_fkey" FOREIGN KEY ("activeIngredientId") REFERENCES "pesticide_active_ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesticide_resistance_assignment" ADD CONSTRAINT "pesticide_resistance_assignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pesticide_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Hand-added safety contracts (inexpressible in Prisma's DSL — S2 plan K2/K4/G4/C3) ─────────────

-- (5, G4) A product must carry at least one registration number. NOT-NULL on epaRegNumber alone would
-- make adjuvants / FIFRA 25(b) products (federally exempt, CA-state-registered) permanently
-- unrepresentable — and many labels legally REQUIRE an adjuvant in the tank.
ALTER TABLE "pesticide_product" ADD CONSTRAINT "chk_product_has_reg_number"
  CHECK ("epaRegNumber" IS NOT NULL OR "caRegNumber" IS NOT NULL);

-- Partial uniques WHERE NOT NULL (Postgres treats NULLs as distinct — a plain UNIQUE would not dedupe,
-- and a plain UNIQUE over the nullable column is exactly the C3 trap).
CREATE UNIQUE INDEX "pesticide_product_epaRegNumber_key" ON "pesticide_product"("epaRegNumber") WHERE "epaRegNumber" IS NOT NULL;
CREATE UNIQUE INDEX "pesticide_product_caRegNumber_key" ON "pesticide_product"("caRegNumber") WHERE "caRegNumber" IS NOT NULL;
CREATE UNIQUE INDEX "pesticide_active_ingredient_pcCode_key" ON "pesticide_active_ingredient"("pcCode") WHERE "pcCode" IS NOT NULL;

-- (1, K2) "Gap is not a clearance" as a schema property: a row can read CODED if and only if it
-- actually carries codes. An empty array can never masquerade as a resolved code, and a resolved row
-- can never be empty. (codes is an ARRAY because premixes legitimately carry several codes — Switch is
-- 9+12 — and the per-scheme partial uniques below allow only one row per subject per scheme.)
ALTER TABLE "pesticide_resistance_assignment" ADD CONSTRAINT "chk_pra_coded_has_codes"
  CHECK (("resolution" = 'CODED') = (cardinality("codes") > 0));

-- (2) Exactly one subject, matching subjectKind — no orphan or double-subject rows.
ALTER TABLE "pesticide_resistance_assignment" ADD CONSTRAINT "chk_pra_subject_exactly_one"
  CHECK (
    ("subjectKind" = 'ACTIVE_INGREDIENT' AND "activeIngredientId" IS NOT NULL AND "productId" IS NULL)
    OR ("subjectKind" = 'PRODUCT' AND "productId" IS NOT NULL AND "activeIngredientId" IS NULL)
  );

-- (3, K4 — the Switch guard) An AI-keyed source lists trade names as "products CONTAINING this AI",
-- not "products WHOSE CODE is this". Switch appears under cyprodinil (9) but Switch is 9/12; a naive
-- join silently drops group 12 — an under-count of a mode of action, the dangerous direction. As a
-- CHECK, the naive join cannot be inserted.
ALTER TABLE "pesticide_resistance_assignment" ADD CONSTRAINT "chk_pra_product_not_ai_keyed"
  CHECK (NOT ("subjectKind" = 'PRODUCT' AND "derivedFrom" = 'AI_KEYED_TABLE'));

-- (6, C3) One assignment per (subject, scheme) — a Prisma @@unique over nullable columns does NOT
-- dedupe (NULLs distinct), and duplicate rows would double-count coverage and rotation.
CREATE UNIQUE INDEX "pra_ai_scheme_key" ON "pesticide_resistance_assignment"("activeIngredientId", "scheme") WHERE "subjectKind" = 'ACTIVE_INGREDIENT';
CREATE UNIQUE INDEX "pra_product_scheme_key" ON "pesticide_resistance_assignment"("productId", "scheme") WHERE "subjectKind" = 'PRODUCT';

-- Belt-and-braces app_rls grants (auto-granted by default privileges; explicit like the KB precedent).
GRANT SELECT, INSERT, UPDATE, DELETE ON "pesticide_data_revision", "pesticide_product",
  "pesticide_active_ingredient", "pesticide_product_ingredient", "pesticide_site_registration",
  "pesticide_state_registration", "pesticide_use_restriction", "pesticide_resistance_assignment" TO app_rls;
