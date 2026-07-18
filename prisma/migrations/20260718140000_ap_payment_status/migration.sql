-- Plan 076 (Unit 6): A/P payment status (Paid / Outstanding) + pay-from accounts.
-- A brand-new enum (CREATE TYPE — safe to create and reference in the same migration; the Windows enum rule
-- only constrains ALTER TYPE ADD VALUE). All column adds are RLS-neutral (the existing tenant_isolation
-- policies already cover new columns) and nullable (no backfill) — payment status is required BEFORE confirm
-- in app logic, not by a DB NOT NULL, so existing rows stay valid.

CREATE TYPE "ApPaymentStatus" AS ENUM ('OUTSTANDING', 'PAID');

-- IngestedInvoice: the human's choice on the review screen (required before confirm) + when it was paid.
ALTER TABLE "ingested_invoice" ADD COLUMN "paymentStatus" "ApPaymentStatus";
ALTER TABLE "ingested_invoice" ADD COLUMN "paidFromAccount" TEXT;
ALTER TABLE "ingested_invoice" ADD COLUMN "paidAt" TIMESTAMP(3);

-- ApExportEvent: carried onto the aggregate event so the poster can record a QBO BillPayment; the external
-- BillPayment id makes the payment post exactly-once and guards reversal.
ALTER TABLE "ap_export_event" ADD COLUMN "paymentStatus" "ApPaymentStatus";
ALTER TABLE "ap_export_event" ADD COLUMN "paidFromAccount" TEXT;
ALTER TABLE "ap_export_event" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "ap_export_event" ADD COLUMN "paymentExternalId" TEXT;

-- AppSettings: the winery-wide pay-from accounts a BillPayment draws on (bank for a check, credit-card
-- liability for a company card). Either may be unset until first used.
ALTER TABLE "app_settings" ADD COLUMN "apPaymentBankAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "apPaymentCardAccount" TEXT;
