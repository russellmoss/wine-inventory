-- Plan 079 Unit 5: content-based idempotency for the chunk/embed pipeline. Records the contentHash the
-- active chunk-set was built from, so a re-crawl of byte-identical content skips re-embedding. GLOBAL
-- table (no RLS); additive nullable column. app_rls DML already covers the column via existing grants.
ALTER TABLE "knowledge_document" ADD COLUMN "indexedContentHash" TEXT;
