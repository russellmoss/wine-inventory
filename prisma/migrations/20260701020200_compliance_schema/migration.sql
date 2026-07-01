-- Phase 14 Units 1/2/7: tax-class inputs on Lot, bottled ABV on BottlingRun, the period-fold
-- index on lot_operation, and the two new tenant-scoped compliance tables. RLS for the new tables
-- lands in the next migration (20260701020300_compliance_rls). Org tenantId FKs are added here
-- (Phase-12 checklist item 2). app_rls DML is auto-granted by ALTER DEFAULT PRIVILEGES from
-- 20260701000900_app_rls_role (explicit grants added in the RLS migration as belt-and-braces).

-- Unit 1 (Fork 2A) + Unit 2 (Fork 1A): tax-class derivation inputs on Lot.
ALTER TABLE "lot" ADD COLUMN "productType" "ProductType" NOT NULL DEFAULT 'WINE';
ALTER TABLE "lot" ADD COLUMN "carbonation" "CarbonationMethod" NOT NULL DEFAULT 'NONE';
ALTER TABLE "lot" ADD COLUMN "taxAbvOverride" DECIMAL(5,2);

-- Unit 2 (Fork 1A): the ABV stamped at bottling (nullable so historical runs backfill).
ALTER TABLE "bottling_run" ADD COLUMN "bottledAbv" DECIMAL(5,2);

-- Unit 7 (council S3): the period-boundary fold index (lines by tenant + observedAt).
CREATE INDEX "lot_operation_tenantId_observedAt_idx" ON "lot_operation"("tenantId", "observedAt");

-- Unit 7: ComplianceReport (version chain, snapshot, overrides, remarks). FILED rows are immutable.
CREATE TABLE "compliance_report" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cadence" "ReportCadence" NOT NULL DEFAULT 'MONTHLY',
    "status" "ComplianceReportStatus" NOT NULL DEFAULT 'DRAFT',
    "version" "ComplianceReportVersion" NOT NULL DEFAULT 'ORIGINAL',
    "isFinalBusinessReport" BOOLEAN NOT NULL DEFAULT false,
    "amendsReportId" TEXT,
    "onHandEnd" JSONB NOT NULL,
    "computed" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedAt" TIMESTAMP(3),
    "filedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_report_pkey" PRIMARY KEY ("id")
);

-- Unit 7: ComplianceProfile (per-tenant filer identity, like AppSettings).
CREATE TABLE "compliance_profile" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "ein" TEXT,
    "registryNumber" TEXT,
    "operatedByName" TEXT,
    "operatedByAddress" TEXT,
    "operatedByPhone" TEXT,
    "defaultCadence" "ReportCadence" NOT NULL DEFAULT 'MONTHLY',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_profile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_report_tenantId_idx" ON "compliance_report"("tenantId");
CREATE INDEX "compliance_report_tenantId_periodStart_periodEnd_idx" ON "compliance_report"("tenantId", "periodStart", "periodEnd");
CREATE INDEX "compliance_report_amendsReportId_idx" ON "compliance_report"("amendsReportId");
CREATE INDEX "compliance_profile_tenantId_idx" ON "compliance_profile"("tenantId");
CREATE UNIQUE INDEX "compliance_profile_tenantId_key" ON "compliance_profile"("tenantId");

-- Self-FK for the amendment chain (same-tenant by construction; RLS isolates).
ALTER TABLE "compliance_report" ADD CONSTRAINT "compliance_report_amendsReportId_fkey" FOREIGN KEY ("amendsReportId") REFERENCES "compliance_report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase-12 checklist item 2: tenantId FK → organization(id) ON DELETE RESTRICT.
ALTER TABLE "compliance_report" ADD CONSTRAINT "compliance_report_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_profile" ADD CONSTRAINT "compliance_profile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
