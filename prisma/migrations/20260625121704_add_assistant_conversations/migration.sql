-- CreateTable
CREATE TABLE "assistant_conversation" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversation_ownerUserId_updatedAt_idx" ON "assistant_conversation"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "assistant_message_conversationId_createdAt_idx" ON "assistant_message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full-text search: a generated tsvector over message content, backed by a GIN
-- index. Managed here (not by Prisma) since Prisma can't express generated
-- columns. Queried via websearch_to_tsquery + ts_rank + ts_headline.
ALTER TABLE "assistant_message"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;

CREATE INDEX "assistant_message_search_vector_idx"
  ON "assistant_message" USING GIN ("search_vector");
