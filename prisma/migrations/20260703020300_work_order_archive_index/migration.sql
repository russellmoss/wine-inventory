-- Phase 9.1 Unit 5 (E2) — the archive recency-sort index. The archive lists FINALIZED work orders
-- (APPROVED/CANCELLED) newest-first with status/date filters; the existing (tenantId, status, dueAt)
-- index serves the dashboard's due-date bucketing, not this recency scan. Add (tenantId, status,
-- updatedAt) so the archive page is a bounded index scan as finalized history grows.
CREATE INDEX "work_order_tenantId_status_updatedAt_idx" ON "work_order"("tenantId", "status", "updatedAt");
