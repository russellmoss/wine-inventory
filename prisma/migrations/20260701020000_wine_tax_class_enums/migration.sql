-- Phase 14 Unit 1: TTB compliance enums, in a dedicated CREATE-TYPE migration.
-- These are brand-new enums (no ALTER TYPE ADD VALUE rule applies), created here so the columns +
-- tables that USE them land in the next migration. ProductType/CarbonationMethod are stored on Lot;
-- the three Compliance* enums back the ComplianceReport table. WineTaxClass is intentionally NOT a
-- DB enum — it is derived at report time and stored as a string in the report snapshot Json (the
-- TS union in src/lib/compliance/types.ts is the single authority, keeping the pure logic DB-free).

CREATE TYPE "ProductType" AS ENUM ('WINE', 'HARD_CIDER');
CREATE TYPE "CarbonationMethod" AS ENUM ('NONE', 'NATURAL', 'ARTIFICIAL');
CREATE TYPE "ComplianceReportStatus" AS ENUM ('DRAFT', 'FILED');
CREATE TYPE "ComplianceReportVersion" AS ENUM ('ORIGINAL', 'AMENDED');
CREATE TYPE "ReportCadence" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');
