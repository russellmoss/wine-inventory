-- Spray Intelligence S2b Unit 7b — the coded pest vocabulary (council GQ1).
--
-- HAND-AUTHORED (see the _s2b_product_facts migration header for why `prisma migrate diff` is unsafe
-- against this database). Purely additive: two new tenant-GLOBAL reference tables, no column changes.
--
-- Source: CA DPR `target_pest.dat` + `prod_target_pest.dat`, in the SAME directory S2 already
-- ingests (files.cdpr.ca.gov/pub/outgoing/product/), refreshed 2026-07-24, host already in
-- TRUSTED_DOMAINS. Probed and read verbatim in phases/S2b-cdpr-interval-probe.md.
--
-- ⚠️ 41 COARSE CATEGORIES, NOT SPECIES. EPA APPRIL carries no target pest at all (its PEST_CAT is
-- the PRODUCT category) and there is no public species-level source, so "powdery mildew" cannot be
-- coded. `spray_application.targetPest` (free text) remains the truth of record; `targetPestCode`
-- is an optional, human-confirmed companion. Nothing may render a category as a species.

CREATE TABLE "pesticide_pest_category" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceAsOf" TIMESTAMP(3) NOT NULL,
    "revisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pesticide_pest_category_pkey" PRIMARY KEY ("code")
);
CREATE INDEX "pesticide_pest_category_revisionId_idx" ON "pesticide_pest_category"("revisionId");

CREATE TABLE "pesticide_product_pest" (
    "id" TEXT NOT NULL,
    "epaRegNumber" TEXT NOT NULL,
    "pestCode" TEXT NOT NULL,
    "revisionId" TEXT,
    CONSTRAINT "pesticide_product_pest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pesticide_product_pest_epaRegNumber_pestCode_key" ON "pesticide_product_pest"("epaRegNumber", "pestCode");
CREATE INDEX "pesticide_product_pest_epaRegNumber_idx" ON "pesticide_product_pest"("epaRegNumber");
CREATE INDEX "pesticide_product_pest_pestCode_idx" ON "pesticide_product_pest"("pestCode");

-- RESTRICT, not CASCADE: reference rows are never deleted (K14 mark-and-sweep), and a mapping whose
-- category vanished should fail loudly rather than silently disappear.
ALTER TABLE "pesticide_product_pest" ADD CONSTRAINT "pesticide_product_pest_pestCode_fkey" FOREIGN KEY ("pestCode") REFERENCES "pesticide_pest_category"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "pesticide_pest_category", "pesticide_product_pest" TO app_rls;
