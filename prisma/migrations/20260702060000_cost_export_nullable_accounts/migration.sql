-- Phase 15 Unit 7 — allow cost_export_event.debitAccount/creditAccount to be NULL so a WITHHELD line
-- (unmapped component, or basis not KNOWN) can be persisted DURABLY as an outbox row + a WITHHELD
-- AccountingDelivery the operator can see and fix — instead of silently emitting nothing. The poster
-- (Unit 8) asserts non-null accounts + balance before it ever posts, so a WITHHELD row is never sent.
-- Additive + safe: NOT NULL -> NULL keeps every existing row's values.

ALTER TABLE "cost_export_event" ALTER COLUMN "debitAccount" DROP NOT NULL;
ALTER TABLE "cost_export_event" ALTER COLUMN "creditAccount" DROP NOT NULL;
