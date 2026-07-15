-- Plan 068 Unit 1: User Inbox schema (tables + FKs; tenant RLS in the paired _inbox_rls migration,
-- per-user RLS in _inbox_user_rls — Unit 1b). Four tenant-scoped tables. Composite cross-tenant FKs
-- (K11) pin messages/attachments to their thread within the tenant. recipient/sender/participant ids
-- are plain single-column FKs to the GLOBAL "user" table (no tenantId there — precedent: field_note).

-- CreateEnum
CREATE TYPE "InboxCategory" AS ENUM ('WORK_ORDER', 'TICKET', 'DIRECT_MESSAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InboxKind" AS ENUM ('TICKET_REPLY', 'TICKET_STATUS', 'WO_ASSIGNED', 'WO_STATUS', 'DIRECT_MESSAGE');

-- CreateTable
CREATE TABLE "inbox_notification" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "category" "InboxCategory" NOT NULL,
    "kind" "InboxKind" NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_message_thread" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userAEmail" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "userBEmail" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_message" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_message_attachment" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_notification_tenantId_recipientUserId_readAt_archived_idx" ON "inbox_notification"("tenantId", "recipientUserId", "readAt", "archivedAt");

-- CreateIndex
CREATE INDEX "inbox_notification_tenantId_recipientUserId_category_create_idx" ON "inbox_notification"("tenantId", "recipientUserId", "category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_notification_tenantId_id_key" ON "inbox_notification"("tenantId", "id");

-- CreateIndex
CREATE INDEX "direct_message_thread_tenantId_userAId_lastMessageAt_idx" ON "direct_message_thread"("tenantId", "userAId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "direct_message_thread_tenantId_userBId_lastMessageAt_idx" ON "direct_message_thread"("tenantId", "userBId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_thread_tenantId_id_key" ON "direct_message_thread"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_thread_tenantId_userAId_userBId_key" ON "direct_message_thread"("tenantId", "userAId", "userBId");

-- CreateIndex
CREATE INDEX "direct_message_tenantId_threadId_createdAt_idx" ON "direct_message"("tenantId", "threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_tenantId_id_key" ON "direct_message"("tenantId", "id");

-- CreateIndex
CREATE INDEX "direct_message_attachment_tenantId_messageId_idx" ON "direct_message_attachment"("tenantId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_attachment_tenantId_id_key" ON "direct_message_attachment"("tenantId", "id");

-- Promote every (tenantId, id) unique index to a CONSTRAINT so it can be a composite-FK target (K11).
ALTER TABLE "inbox_notification" ADD CONSTRAINT "inbox_notification_tenantId_id_key" UNIQUE USING INDEX "inbox_notification_tenantId_id_key";
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_tenantId_id_key" UNIQUE USING INDEX "direct_message_thread_tenantId_id_key";
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_tenantId_id_key" UNIQUE USING INDEX "direct_message_tenantId_id_key";
ALTER TABLE "direct_message_attachment" ADD CONSTRAINT "direct_message_attachment_tenantId_id_key" UNIQUE USING INDEX "direct_message_attachment_tenantId_id_key";

-- Sorted-pair convention enforced in the DB (council amendment 9): userAId < userBId (which also
-- guarantees userAId <> userBId). Both named checks are recorded to document intent.
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_sorted_pair_chk" CHECK ("userAId" < "userBId");
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_distinct_pair_chk" CHECK ("userAId" <> "userBId");

-- tenantId -> organization(id) on every table (tenant scoping backbone).
ALTER TABLE "inbox_notification" ADD CONSTRAINT "inbox_notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_message_attachment" ADD CONSTRAINT "direct_message_attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite cross-tenant FKs (K11): message -> thread, attachment -> message, pinned within the tenant.
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_thread_fkey" FOREIGN KEY ("tenantId", "threadId") REFERENCES "direct_message_thread"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "direct_message_attachment" ADD CONSTRAINT "direct_message_attachment_message_fkey" FOREIGN KEY ("tenantId", "messageId") REFERENCES "direct_message"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;

-- Single-column FKs to the GLOBAL "user" table (User has no tenantId — no composite FK). Required
-- refs CASCADE on user delete; the nullable actor SETs NULL (precedent: field_note.userId).
ALTER TABLE "inbox_notification" ADD CONSTRAINT "inbox_notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbox_notification" ADD CONSTRAINT "inbox_notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_message_thread" ADD CONSTRAINT "direct_message_thread_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
