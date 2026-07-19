-- Plan 079 Unit 1: knowledge-base RAG corpus (schema). GLOBAL reference tables (like fx_rate) — NO
-- tenantId, NO RLS; listed in GLOBAL_MODELS + mirrored in scripts/verify-tenant-isolation.ts. The ONE
-- tenant-scoped table (knowledge_source_subscription) gets RLS in the paired _knowledge_base_rls migration.
-- Hand-written (not migrate dev): CREATE EXTENSION runs BEFORE any vector(1024) column; the tsvector column
-- is GENERATED (Prisma can't express it). app_rls DML is auto-granted by ALTER DEFAULT PRIVILEGES
-- (20260701000900_app_rls_role); the GRANTs below are belt-and-braces.

-- pgvector must exist before any vector(N) column is created.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "knowledge_source" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "homeDomain" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "license" TEXT NOT NULL,
    "seedRoots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "allowPrefixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "denyPrefixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "crawlCadence" TEXT NOT NULL DEFAULT 'weekly',
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_domain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trusted_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_source" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "discoveredFromUrl" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "candidate_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_blob" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "blobUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_blob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "blobId" TEXT,
    "canonicalTitle" TEXT,
    "publisher" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "license" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sitemapLastmod" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "etag" TEXT,
    "lastModifiedHttp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activeRevision" INTEGER NOT NULL DEFAULT 0,
    "withdrawnAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_url_observation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_url_observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable (embedding vector(1024) — extension created above)
CREATE TABLE "knowledge_chunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "sectionPath" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "embedding" vector(1024),
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "embeddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable (tenant-scoped; RLS added in the paired _knowledge_base_rls migration)
CREATE TABLE "knowledge_source_subscription" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_source_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_source_key_key" ON "knowledge_source"("key");
CREATE UNIQUE INDEX "knowledge_source_homeDomain_key" ON "knowledge_source"("homeDomain");
CREATE UNIQUE INDEX "trusted_domain_domain_key" ON "trusted_domain"("domain");
CREATE UNIQUE INDEX "candidate_source_domain_key" ON "candidate_source"("domain");
CREATE UNIQUE INDEX "knowledge_blob_contentHash_key" ON "knowledge_blob"("contentHash");
CREATE UNIQUE INDEX "knowledge_document_sourceId_canonicalUrl_key" ON "knowledge_document"("sourceId", "canonicalUrl");
CREATE INDEX "knowledge_document_sourceId_status_idx" ON "knowledge_document"("sourceId", "status");
CREATE INDEX "knowledge_document_status_idx" ON "knowledge_document"("status");
CREATE UNIQUE INDEX "knowledge_url_observation_url_key" ON "knowledge_url_observation"("url");
CREATE INDEX "knowledge_url_observation_documentId_idx" ON "knowledge_url_observation"("documentId");
CREATE UNIQUE INDEX "knowledge_chunk_documentId_revision_ordinal_key" ON "knowledge_chunk"("documentId", "revision", "ordinal");
CREATE INDEX "knowledge_chunk_documentId_revision_idx" ON "knowledge_chunk"("documentId", "revision");
CREATE UNIQUE INDEX "knowledge_source_subscription_tenantId_sourceId_key" ON "knowledge_source_subscription"("tenantId", "sourceId");
CREATE INDEX "knowledge_source_subscription_tenantId_idx" ON "knowledge_source_subscription"("tenantId");
CREATE INDEX "knowledge_source_subscription_sourceId_idx" ON "knowledge_source_subscription"("sourceId");

-- Lexical arm of hybrid search: a GENERATED tsvector over chunk text + GIN index (Prisma can't express
-- generated columns; managed here). Queried via websearch_to_tsquery + ts_rank (Unit 6).
ALTER TABLE "knowledge_chunk"
    ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED;
CREATE INDEX "knowledge_chunk_search_vector_idx" ON "knowledge_chunk" USING GIN ("search_vector");

-- AddForeignKey
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "knowledge_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "knowledge_blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_url_observation" ADD CONSTRAINT "knowledge_url_observation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Subscription: Phase-12 tenant FK -> organization, plus a plain FK to the GLOBAL knowledge_source.
ALTER TABLE "knowledge_source_subscription" ADD CONSTRAINT "knowledge_source_subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_source_subscription" ADD CONSTRAINT "knowledge_source_subscription_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "knowledge_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants owner-created tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_source" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "trusted_domain" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "candidate_source" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_blob" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_document" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_url_observation" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_chunk" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_source_subscription" TO app_rls;
