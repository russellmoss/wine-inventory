-- CreateTable
CREATE TABLE "assistant_confirmation" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_confirmation_nonce_key" ON "assistant_confirmation"("nonce");
