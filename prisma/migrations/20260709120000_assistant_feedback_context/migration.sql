-- Persist the server-side conversation/message anchors used to rebuild a
-- feedback snapshot, plus bounded operational debug context for the rated turn.
ALTER TABLE "assistant_feedback"
  ADD COLUMN "conversationId" TEXT,
  ADD COLUMN "ratedMessageId" TEXT,
  ADD COLUMN "debugContext" JSONB;

CREATE INDEX "assistant_feedback_conversationId_idx" ON "assistant_feedback"("conversationId");
CREATE INDEX "assistant_feedback_ratedMessageId_idx" ON "assistant_feedback"("ratedMessageId");
