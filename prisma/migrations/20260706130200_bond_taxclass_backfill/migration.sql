-- Phase 2 (Bond + tax-class) — DATA backfill (data-only, idempotent). Runs as the migration owner
-- (BYPASSRLS) so it writes across all tenants. Two steps:
--   1. Create exactly one PRIMARY bond per tenant that has wine/compliance data, seeded from the
--      tenant's compliance_profile (registry number + address). Deterministic id ('bond_primary_'||org)
--      + NOT EXISTS guard => re-running is a no-op (idempotent). A tenant with no registryNumber gets
--      'UNSET' (per-tenant unique holds; the winery edits it self-serve later, ux-principle 9).
--   2. Point every existing 5120.17 report at its tenant's primary bond (per-bond scoping). The 5000.24
--      EXCISE return stays bond-agnostic (bondId NULL) — excise is stateless-YTD, not bond-scoped.
-- Legacy lot_operation_line bond columns are intentionally left NULL (OQ-3): the bond derives to the
-- primary bond; only bond-moving ops stamp an explicit bond going forward.
--
-- ROLLBACK: UPDATE "compliance_report" SET "bondId" = NULL; DELETE FROM "bond" WHERE id LIKE 'bond_primary_%';

-- 1. One primary bond per tenant with wine/compliance data.
INSERT INTO "bond" ("tenantId", "id", "registryNumber", "penalSum", "premises", "isPrimary", "createdAt", "updatedAt")
SELECT o."id",
       'bond_primary_' || o."id",
       COALESCE(NULLIF(cp."registryNumber", ''), 'UNSET'),
       NULL,
       cp."operatedByAddress",
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "organization" o
LEFT JOIN "compliance_profile" cp ON cp."tenantId" = o."id"
WHERE (
      EXISTS (SELECT 1 FROM "lot" l WHERE l."tenantId" = o."id")
   OR EXISTS (SELECT 1 FROM "compliance_report" r WHERE r."tenantId" = o."id")
   OR cp."tenantId" IS NOT NULL
)
AND NOT EXISTS (
      SELECT 1 FROM "bond" b WHERE b."tenantId" = o."id" AND b."isPrimary"
);

-- 2. Point existing 5120.17 reports at the tenant's primary bond (excise stays NULL).
UPDATE "compliance_report" r
SET "bondId" = b."id"
FROM "bond" b
WHERE b."tenantId" = r."tenantId"
  AND b."isPrimary"
  AND r."bondId" IS NULL
  AND r."formType" = 'TTB_5120_17';
