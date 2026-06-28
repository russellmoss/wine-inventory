-- Phase 4 chemistry / tasting / samples: STANDALONE records (NOT ledger ops — no
-- writeLotOperation). AnalysisPanel header + AnalysisReading children, LotTastingNote,
-- and the Sample lifecycle. Additive only (no drops). New enums are CREATE TYPE (fresh
-- types — no ALTER TYPE ADD VALUE gotcha). The new AuditAction values used at runtime
-- were committed in the preceding enum migration. Does NOT touch the vineyard brix_log.

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('PULLED', 'SENT', 'PENDING', 'RESULT_RETURNED', 'ATTACHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TastingReadiness" AS ENUM ('NEEDS_MORE_TIME', 'READY_TO_BLEND', 'READY_TO_BOTTLE', 'HOLD', 'DECLINING');

-- CreateEnum
CREATE TYPE "TastingScoreScale" AS ENUM ('HUNDRED_POINT', 'TWENTY_POINT');

-- CreateTable: analysis_panel (panel HEADER — owns observedAt + provenance + sample link + void)
CREATE TABLE "analysis_panel" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "vesselId" TEXT,
    "sampleId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "captureMethod" "CaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "clientRequestId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: analysis_reading (child reading; analyte is a code-validated registry key)
CREATE TABLE "analysis_reading" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "analyte" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable: lot_tasting_note (structured tasting note; contains-search, no tsvector)
CREATE TABLE "lot_tasting_note" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "vesselId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "captureMethod" "CaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "appearance" TEXT,
    "aroma" TEXT,
    "flavor" TEXT,
    "tannin" INTEGER,
    "acidity" INTEGER,
    "body" INTEGER,
    "finish" INTEGER,
    "score" INTEGER,
    "scoreScale" "TastingScoreScale",
    "readiness" "TastingReadiness",
    "notes" TEXT,
    "clientRequestId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_tasting_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sample (lab/bench sample lifecycle; 1→many analysis_panel)
CREATE TABLE "sample" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "vesselId" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'PULLED',
    "source" TEXT,
    "lab" TEXT,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "resultedAt" TIMESTAMP(3),
    "attachedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "captureMethod" "CaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_panel_clientRequestId_key" ON "analysis_panel"("clientRequestId");

-- CreateIndex
CREATE INDEX "analysis_panel_lotId_observedAt_idx" ON "analysis_panel"("lotId", "observedAt");

-- CreateIndex
CREATE INDEX "analysis_panel_vesselId_idx" ON "analysis_panel"("vesselId");

-- CreateIndex
CREATE INDEX "analysis_panel_sampleId_idx" ON "analysis_panel"("sampleId");

-- CreateIndex
CREATE INDEX "analysis_reading_panelId_idx" ON "analysis_reading"("panelId");

-- CreateIndex
CREATE INDEX "analysis_reading_analyte_idx" ON "analysis_reading"("analyte");

-- CreateIndex
CREATE UNIQUE INDEX "lot_tasting_note_clientRequestId_key" ON "lot_tasting_note"("clientRequestId");

-- CreateIndex
CREATE INDEX "lot_tasting_note_lotId_observedAt_idx" ON "lot_tasting_note"("lotId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sample_clientRequestId_key" ON "sample"("clientRequestId");

-- CreateIndex
CREATE INDEX "sample_lotId_status_idx" ON "sample"("lotId", "status");

-- CreateIndex
CREATE INDEX "sample_status_idx" ON "sample"("status");

-- AddForeignKey
ALTER TABLE "analysis_panel" ADD CONSTRAINT "analysis_panel_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_panel" ADD CONSTRAINT "analysis_panel_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_panel" ADD CONSTRAINT "analysis_panel_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_reading" ADD CONSTRAINT "analysis_reading_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "analysis_panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_tasting_note" ADD CONSTRAINT "lot_tasting_note_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_tasting_note" ADD CONSTRAINT "lot_tasting_note_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample" ADD CONSTRAINT "sample_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample" ADD CONSTRAINT "sample_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
