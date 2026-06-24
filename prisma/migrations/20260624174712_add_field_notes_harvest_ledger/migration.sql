-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'FIELD_NOTE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'FIELD_INPUT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_VINEYARD_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'BRIX_LOGGED';
ALTER TYPE "AuditAction" ADD VALUE 'HARVEST_ESTIMATED';
ALTER TYPE "AuditAction" ADD VALUE 'HARVEST_PICK_RECORDED';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "assignedVineyardId" TEXT;

-- CreateTable
CREATE TABLE "field_note" (
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "weatherData" JSONB NOT NULL,
    "spraysApplied" JSONB NOT NULL,
    "fertilizersApplied" JSONB NOT NULL,
    "blockLevelStatuses" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "generalNotes" TEXT,
    "aiSummary" TEXT,
    "aiSummaryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "aiSummaryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_input" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brix_log" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "brixValue" DECIMAL(4,1) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "brix_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_record" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "vintageYear" INTEGER NOT NULL,
    "yieldEstimateKg" DECIMAL(12,3),
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "updatedByEmail" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvest_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_pick" (
    "id" TEXT NOT NULL,
    "harvestRecordId" TEXT NOT NULL,
    "pickDate" DATE NOT NULL,
    "weightKg" DECIMAL(12,3) NOT NULL,
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_pick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_note_vineyardId_weekOf_idx" ON "field_note"("vineyardId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "field_note_vineyardId_weekOf_key" ON "field_note"("vineyardId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "field_input_type_normalizedKey_key" ON "field_input"("type", "normalizedKey");

-- CreateIndex
CREATE INDEX "brix_log_blockId_recordedAt_idx" ON "brix_log"("blockId", "recordedAt");

-- CreateIndex
CREATE INDEX "brix_log_vineyardId_idx" ON "brix_log"("vineyardId");

-- CreateIndex
CREATE INDEX "harvest_record_vineyardId_vintageYear_idx" ON "harvest_record"("vineyardId", "vintageYear");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_record_blockId_vintageYear_key" ON "harvest_record"("blockId", "vintageYear");

-- CreateIndex
CREATE INDEX "harvest_pick_harvestRecordId_pickDate_idx" ON "harvest_pick"("harvestRecordId", "pickDate");

-- CreateIndex
CREATE INDEX "user_assignedVineyardId_idx" ON "user"("assignedVineyardId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_assignedVineyardId_fkey" FOREIGN KEY ("assignedVineyardId") REFERENCES "vineyard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_note" ADD CONSTRAINT "field_note_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_note" ADD CONSTRAINT "field_note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brix_log" ADD CONSTRAINT "brix_log_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "vineyard_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brix_log" ADD CONSTRAINT "brix_log_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_record" ADD CONSTRAINT "harvest_record_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "vineyard_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_record" ADD CONSTRAINT "harvest_record_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_pick" ADD CONSTRAINT "harvest_pick_harvestRecordId_fkey" FOREIGN KEY ("harvestRecordId") REFERENCES "harvest_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: Decimal(4,1) alone allows up to 999.9; clamp Brix to a sane 0..40 °Bx range.
ALTER TABLE "brix_log" ADD CONSTRAINT "brix_log_brixValue_range" CHECK ("brixValue" >= 0 AND "brixValue" <= 40);
