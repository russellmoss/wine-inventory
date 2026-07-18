-- Plan 076 (Unit 3): one Bill per invoice.
-- RLS-neutral COLUMN adds on ap_export_event (the existing tenant_isolation policy already covers new
-- columns). An AGGREGATE per-invoice A/P event carries the whole invoice's bill lines, keyed
-- postingKey = 'apinv:<ingestedInvoiceId>'. `ingestedInvoiceId` is traceability only (no hard FK — mirrors
-- the existing supplyLotId column). `billLinesJson` holds the QBO Bill's multiple lines grouped by GL
-- account: [{ debitAccount, amount, description }] in the document (foreign) currency; null on a legacy
-- single-line per-lot event.

ALTER TABLE "ap_export_event" ADD COLUMN "ingestedInvoiceId" TEXT;
ALTER TABLE "ap_export_event" ADD COLUMN "billLinesJson" JSONB;

CREATE INDEX "ap_export_event_tenantId_ingestedInvoiceId_idx" ON "ap_export_event"("tenantId", "ingestedInvoiceId");
