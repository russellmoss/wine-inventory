-- CreateTable
CREATE TABLE "assistant_feedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "conversation" JSONB NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "prUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "assistant_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_feedback_status_createdAt_idx" ON "assistant_feedback"("status", "createdAt");
