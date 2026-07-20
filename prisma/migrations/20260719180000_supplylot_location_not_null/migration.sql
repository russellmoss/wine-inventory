-- Plan 080 U13a (contract phase): supply_lot."locationId" becomes NOT NULL.
--
-- This is the final step of the deploy-safe expand/contract sequence started in U1 (council S7):
--   1. U1  — add the column NULLABLE (never a `@default("")`, which would let a stale writer insert '')
--   2. U2a — every app writer stamps a locationId (system "Winery" location when none is given)
--   3. U13a — the verify/seed SCRIPTS stamp it too. They were the last NULL producers: the app paths were
--             already clean, so this constraint would not have broken production, it would have reddened CI.
--   4. backfill — scripts/backfill-supplylot-location.ts, re-run to 0 nulls across all 8 tenants
--   5. THIS — contract the column
--
-- Verified 0 NULLs immediately before authoring (123 rows across 8 tenants), and re-verified that the four
-- verify suites which CREATE SupplyLots (cost / tenant-isolation / work-orders-enhancements / ingest) leave
-- 0 NULLs behind. So the scan below validates instantly.
--
-- Reversible: `ALTER TABLE "supply_lot" ALTER COLUMN "locationId" DROP NOT NULL;`

-- Fail CLOSED with a readable message rather than letting the ALTER emit a bare constraint error.
DO $$
DECLARE
  bad BIGINT;
BEGIN
  SELECT COUNT(*) INTO bad FROM "supply_lot" WHERE "locationId" IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'supply_lot has % row(s) with a NULL locationId — run scripts/backfill-supplylot-location.ts before contracting the column', bad;
  END IF;
END
$$;

ALTER TABLE "supply_lot" ALTER COLUMN "locationId" SET NOT NULL;
