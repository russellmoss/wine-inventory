-- Phase 15 Unit 4 — display-only, non-secret columns on accounting_connection so the Settings card can
-- say "Connected to <company>" without a live API round-trip on every page load. Neither is a secret;
-- both are additive + nullable (no backfill, no RLS change — RLS already covers the table).

ALTER TABLE "accounting_connection" ADD COLUMN "companyName" TEXT;
ALTER TABLE "accounting_connection" ADD COLUMN "connectedAt" TIMESTAMP(3);
