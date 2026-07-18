-- Plan 073: multi-currency FX ingestion.
-- RLS-neutral COLUMN adds on existing tenant tables (the existing tenant_isolation policies already cover
-- new columns) + ONE new GLOBAL reference table (fx_rate) that is deliberately NOT tenant-scoped and has
-- NO RLS — ECB reference rates are identical for every tenant, so the daily rate cache is shared (mirror of
-- the Better-Auth globals). fx_rate is added to GLOBAL_MODELS in src/lib/tenant/models.ts and the mirror in
-- scripts/verify-tenant-isolation.ts so the tenant extension passes it through and the RLS coverage guard
-- skips it.

-- ─────────────────────────── Column adds on existing tables (RLS-neutral) ───────────────────────────
-- QBO company multicurrency flag, read at connect time (council #2 — early, not at AP-export).
ALTER TABLE "accounting_connection" ADD COLUMN "multiCurrencyEnabled" BOOLEAN;

-- The vendor's transaction currency. NOT NULL DEFAULT 'USD' backfills every existing row to USD, which is
-- correct: both live tenants (Demo Winery, Bhutan) are USD-base and every existing vendor was created under
-- single-currency operation. U6 swaps the unique key to (tenantId, name, currency) with the resolver change.
ALTER TABLE "vendor" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

-- A/P event carries the FOREIGN amount (existing "amount"/"currency") + the pinned rate; QBO derives the
-- home GL = amount × exchangeRate (council #1 — decoupled from the base inventory cost).
ALTER TABLE "ap_export_event" ADD COLUMN "exchangeRate" DECIMAL(18,8);

-- SupplyLot: base unitCost stays the roll-up basis; the foreign figures are stored immutably for audit only.
ALTER TABLE "supply_lot" ADD COLUMN "foreignUnitCost" DECIMAL(18,8);
ALTER TABLE "supply_lot" ADD COLUMN "foreignCurrency" TEXT;
ALTER TABLE "supply_lot" ADD COLUMN "fxRate" DECIMAL(18,8);
ALTER TABLE "supply_lot" ADD COLUMN "fxRateDate" TIMESTAMP(3);
ALTER TABLE "supply_lot" ADD COLUMN "fxRateSource" TEXT;

-- IngestedInvoice: the rate snapshot applied at apply time (editable pre-apply, locked once applied).
ALTER TABLE "ingested_invoice" ADD COLUMN "baseCurrency" TEXT;
ALTER TABLE "ingested_invoice" ADD COLUMN "fxRate" DECIMAL(18,8);
ALTER TABLE "ingested_invoice" ADD COLUMN "fxRateDate" TIMESTAMP(3);
ALTER TABLE "ingested_invoice" ADD COLUMN "fxRateSource" TEXT;

-- ─────────────────────────── New GLOBAL reference table (no tenantId, no RLS) ───────────────────────────
CREATE TABLE "fx_rate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rateDate" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fx_rate_base_quote_rateDate_key" ON "fx_rate"("base", "quote", "rateDate");
CREATE INDEX "fx_rate_base_quote_idx" ON "fx_rate"("base", "quote");

-- The pooled app role reads/writes the shared cache directly (no RLS to satisfy — it's global reference data).
GRANT SELECT, INSERT, UPDATE, DELETE ON "fx_rate" TO app_rls;
