-- Phase 8 Units 1/2: the four NEW enum TYPES for cost roll-up + supply stock. Kept in an isolated
-- enum-only migration ahead of the table migration, matching the repo's convention (e.g.
-- 20260701020000_wine_tax_class_enums). These are brand-new CREATE TYPEs — there is NO ALTER TYPE
-- ADD VALUE here, so the same-tx enum-value gotcha does not apply; the split is purely for a clean seam.

CREATE TYPE "CostComponent" AS ENUM ('MATERIAL', 'FRUIT', 'BARREL', 'LABOR', 'OVERHEAD', 'DOSAGE_LIQUEUR', 'PACKAGING', 'VARIANCE');
CREATE TYPE "CostingMethod" AS ENUM ('WEIGHTED_AVG', 'FIFO');
CREATE TYPE "CostBasisCompleteness" AS ENUM ('KNOWN', 'PARTIAL', 'UNKNOWN');
CREATE TYPE "LotOwnership" AS ENUM ('ESTATE', 'CUSTOM_CRUSH_CLIENT');
