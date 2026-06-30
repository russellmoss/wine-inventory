-- AlterTable
ALTER TABLE "analysis_panel" ADD COLUMN     "deviceObservedAt" TIMESTAMP(3),
ADD COLUMN     "occupancyToken" TEXT,
ADD COLUMN     "serverReceivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "analysis_reading" ADD COLUMN     "captureId" TEXT;

-- AlterTable

-- AlterTable
ALTER TABLE "lot" ADD COLUMN     "afState" "AlcoholicFermState" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "mlfState" "MalolacticState" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "lot_operation" ADD COLUMN     "commandId" TEXT;

-- CreateTable
CREATE TABLE "lot_harvest_source" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "harvestPickId" TEXT NOT NULL,
    "consumedKg" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_harvest_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_state_event" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "vesselId" TEXT,
    "kind" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "captureMethod" "CaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "operationId" INTEGER,
    "commandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_state_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lot_harvest_source_lotId_idx" ON "lot_harvest_source"("lotId");

-- CreateIndex
CREATE INDEX "lot_harvest_source_harvestPickId_idx" ON "lot_harvest_source"("harvestPickId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_state_event_commandId_key" ON "lot_state_event"("commandId");

-- CreateIndex
CREATE INDEX "lot_state_event_lotId_observedAt_idx" ON "lot_state_event"("lotId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_reading_captureId_key" ON "analysis_reading"("captureId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_reading_panelId_analyte_key" ON "analysis_reading"("panelId", "analyte");

-- CreateIndex
CREATE UNIQUE INDEX "lot_operation_commandId_key" ON "lot_operation"("commandId");

-- AddForeignKey
ALTER TABLE "lot_harvest_source" ADD CONSTRAINT "lot_harvest_source_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_harvest_source" ADD CONSTRAINT "lot_harvest_source_harvestPickId_fkey" FOREIGN KEY ("harvestPickId") REFERENCES "harvest_pick"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_state_event" ADD CONSTRAINT "lot_state_event_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_state_event" ADD CONSTRAINT "lot_state_event_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_state_event" ADD CONSTRAINT "lot_state_event_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "lot_operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

