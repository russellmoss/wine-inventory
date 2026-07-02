-- Phase 14 plan-026 Unit 1: generalize compliance_report for a second form (the wine excise return)
-- and add the per-tenant excise-return cadence settings. No RLS change — these are new COLUMNS on
-- existing tenant-scoped, already-RLS-forced tables (compliance_report / compliance_profile), so the
-- tenant_isolation policy already covers every new row (Phase-12 checklist: RLS is per-table).

-- Fork 1A: the form discriminator. New enum (CREATE TYPE, no ALTER-VALUE rule applies).
CREATE TYPE "ComplianceFormType" AS ENUM ('TTB_5120_17', 'TTB_5000_24');

-- compliance_report: which form + the net excise tax (display/query mirror of the computed snapshot).
-- Existing rows default to TTB_5120_17 (they are operations reports); taxDollars stays NULL for them.
ALTER TABLE "compliance_report" ADD COLUMN "formType" "ComplianceFormType" NOT NULL DEFAULT 'TTB_5120_17';
ALTER TABLE "compliance_report" ADD COLUMN "taxDollars" DECIMAL(12,2);
CREATE INDEX "compliance_report_tenantId_formType_idx" ON "compliance_report"("tenantId", "formType");

-- compliance_profile: the excise-return cadence (separate from the ops defaultCadence) + EFT-payer
-- flag (drives the September triple-split boundaries, council C1). SEMIMONTHLY is the safe default
-- (the fallback cadence above the $50k threshold); the value is available because 20260701040000
-- committed it first.
ALTER TABLE "compliance_profile" ADD COLUMN "defaultReturnCadence" "ReportCadence" NOT NULL DEFAULT 'SEMIMONTHLY';
ALTER TABLE "compliance_profile" ADD COLUMN "isEftPayer" BOOLEAN NOT NULL DEFAULT false;
