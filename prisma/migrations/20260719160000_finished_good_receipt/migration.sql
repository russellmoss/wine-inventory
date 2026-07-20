-- Plan 080 U7: the PURCHASED-cost layer for finished goods (council C4) + list price on the SKUs.
--
-- Valuation of 3rd-party / merch / externally-purchased finished goods becomes the WEIGHTED AVERAGE over
-- append-only receipts, rather than a mutable `unitCogs` column on the SKU (a second source of truth with
-- no history) or last-cost (whipsaws COGS). Internally-bottled wine is untouched — it keeps its specific-lot
-- COGS from the frozen bottling_cost_snapshot (COST-3).
--
-- Hand-authored (Windows/Neon rule): `prisma migrate diff` is unusable here — the live DB carries hundreds
-- of raw-SQL composite tenant FKs + RLS policies the datamodel does not model, so a diff emits a
-- destructive DropForeignKey storm.

-- ── 1. List PRICE on the catalog rows. A price is safe as a mutable column; COGS is not (see above). ──
ALTER TABLE "wine_sku" ADD COLUMN "msrp" DECIMAL(18,2);
ALTER TABLE "finished_good" ADD COLUMN "msrp" DECIMAL(18,2);

-- ── 2. finished_good gains the composite-tenant-FK target it lacked (wine_sku already has one) ─────────
-- Without this, finished_good_receipt could only use a SIMPLE FK — the exact defect U13a had to fix for
-- supply_lot.locationId, where a row in tenant B could reference tenant A's parent.
CREATE UNIQUE INDEX "finished_good_tenantId_id_key" ON "finished_good" ("tenantId", "id");

-- ── 3. The receipt cost layer ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "finished_good_receipt" (
  "tenantId"            TEXT           NOT NULL DEFAULT '',
  "id"                  TEXT           NOT NULL,
  "wineSkuId"           TEXT,
  "finishedGoodId"      TEXT,
  "qty"                 INTEGER        NOT NULL,
  "unitCostBase"        DECIMAL(18,8)  NOT NULL,
  "currency"            TEXT           NOT NULL DEFAULT 'USD',
  "foreignUnitCost"     DECIMAL(18,8),
  "foreignCurrency"     TEXT,
  "fxRate"              DECIMAL(18,8),
  "fxRateDate"          TIMESTAMP(3),
  "fxRateSource"        TEXT,
  "locationId"          TEXT           NOT NULL,
  "receivedAt"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vendorId"            TEXT,
  "sourceInvoiceLineId" TEXT,
  "note"                TEXT,
  "createdById"         TEXT,
  "createdByEmail"      TEXT           NOT NULL,
  "createdAt"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finished_good_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finished_good_receipt_tenantId_id_key" ON "finished_good_receipt" ("tenantId", "id");
CREATE INDEX "finished_good_receipt_tenantId_idx" ON "finished_good_receipt" ("tenantId");
CREATE INDEX "fgr_tenant_sku_received_idx" ON "finished_good_receipt" ("tenantId", "wineSkuId", "receivedAt");
CREATE INDEX "fgr_tenant_good_received_idx" ON "finished_good_receipt" ("tenantId", "finishedGoodId", "receivedAt");
CREATE INDEX "fgr_tenant_location_idx" ON "finished_good_receipt" ("tenantId", "locationId");

-- EXACTLY ONE target: a receipt values either a wine SKU or a merch good, never both, never neither.
-- Without this a row could silently value nothing (and be invisible to both weighted-avg scans).
ALTER TABLE "finished_good_receipt"
  ADD CONSTRAINT "finished_good_receipt_one_target_check"
  CHECK (("wineSkuId" IS NOT NULL)::int + ("finishedGoodId" IS NOT NULL)::int = 1);

-- A receipt is a positive event; a correction is its own reversal concern, not a negative row smuggled in.
ALTER TABLE "finished_good_receipt" ADD CONSTRAINT "finished_good_receipt_qty_check" CHECK ("qty" > 0);
-- Cost may be 0 (a genuine freebie/sample) but never negative.
ALTER TABLE "finished_good_receipt" ADD CONSTRAINT "finished_good_receipt_cost_check" CHECK ("unitCostBase" >= 0);

-- ── 4. Composite-tenant FKs (K11) — every parent reference carries the tenant ──────────────────────────
ALTER TABLE "finished_good_receipt"
  ADD CONSTRAINT "finished_good_receipt_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_good_receipt"
  ADD CONSTRAINT "finished_good_receipt_tenant_sku_fkey"
  FOREIGN KEY ("tenantId", "wineSkuId") REFERENCES "wine_sku"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_good_receipt"
  ADD CONSTRAINT "finished_good_receipt_tenant_good_fkey"
  FOREIGN KEY ("tenantId", "finishedGoodId") REFERENCES "finished_good"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_good_receipt"
  ADD CONSTRAINT "finished_good_receipt_tenant_location_fkey"
  FOREIGN KEY ("tenantId", "locationId") REFERENCES "location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_good_receipt"
  ADD CONSTRAINT "finished_good_receipt_tenant_vendor_fkey"
  FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 5. RLS (TENANT-1): ENABLE + FORCE + tenant_isolation (USING + WITH CHECK, fail-closed) ─────────────
ALTER TABLE "finished_good_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finished_good_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "finished_good_receipt"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "finished_good_receipt" TO app_rls;

-- Fail closed if RLS is not fully enabled / the policy is missing (a table with no policy is a leak).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'finished_good_receipt' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on finished_good_receipt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'finished_good_receipt' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on finished_good_receipt';
  END IF;
END
$$;
