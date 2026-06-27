-- CreateEnum
CREATE TYPE "LotForm" AS ENUM ('FRUIT', 'MUST', 'JUICE', 'WINE', 'BOTTLED_IN_PROCESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('SEED', 'RACK', 'LOSS', 'ADJUST', 'DEPLETE', 'BOTTLE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "CaptureMethod" AS ENUM ('MANUAL', 'VOICE', 'SENSOR', 'IMPORT');

-- AlterTable

-- AlterTable
ALTER TABLE "bottling_source" ADD COLUMN     "lotId" TEXT;

-- AlterTable
ALTER TABLE "vessel_transfer" ADD COLUMN     "lotOperationId" INTEGER;

-- CreateTable
CREATE TABLE "lot" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "form" "LotForm" NOT NULL DEFAULT 'WINE',
    "originVineyardId" TEXT,
    "originBlockId" TEXT,
    "originVarietyId" TEXT,
    "vintageYear" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "legacySnapshot" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_operation" (
    "id" SERIAL NOT NULL,
    "type" "OperationType" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "enteredBy" TEXT NOT NULL,
    "captureMethod" "CaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "correctsOperationId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_operation_line" (
    "id" SERIAL NOT NULL,
    "operationId" INTEGER NOT NULL,
    "lotId" TEXT NOT NULL,
    "vesselId" TEXT,
    "deltaL" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "lotCode" TEXT NOT NULL,
    "vesselCode" TEXT,

    CONSTRAINT "lot_operation_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessel_lot" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "volumeL" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessel_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_lineage" (
    "id" TEXT NOT NULL,
    "parentLotId" TEXT NOT NULL,
    "childLotId" TEXT NOT NULL,
    "fraction" DECIMAL(6,5),
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_lineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessel_group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vessel_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessel_group_member" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,

    CONSTRAINT "vessel_group_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lot_code_key" ON "lot"("code");

-- CreateIndex
CREATE INDEX "lot_status_idx" ON "lot"("status");

-- CreateIndex
CREATE INDEX "lot_originVineyardId_idx" ON "lot"("originVineyardId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_operation_correctsOperationId_key" ON "lot_operation"("correctsOperationId");

-- CreateIndex
CREATE INDEX "lot_operation_type_observedAt_idx" ON "lot_operation"("type", "observedAt");

-- CreateIndex
CREATE INDEX "lot_operation_line_operationId_idx" ON "lot_operation_line"("operationId");

-- CreateIndex
CREATE INDEX "lot_operation_line_lotId_idx" ON "lot_operation_line"("lotId");

-- CreateIndex
CREATE INDEX "lot_operation_line_vesselId_idx" ON "lot_operation_line"("vesselId");

-- CreateIndex
CREATE INDEX "vessel_lot_lotId_idx" ON "vessel_lot"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_lot_vesselId_lotId_key" ON "vessel_lot"("vesselId", "lotId");

-- CreateIndex
CREATE INDEX "lot_lineage_childLotId_idx" ON "lot_lineage"("childLotId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_lineage_parentLotId_childLotId_key" ON "lot_lineage"("parentLotId", "childLotId");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_group_name_key" ON "vessel_group"("name");

-- CreateIndex
CREATE INDEX "vessel_group_member_vesselId_idx" ON "vessel_group_member"("vesselId");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_group_member_groupId_vesselId_key" ON "vessel_group_member"("groupId", "vesselId");

-- CreateIndex
CREATE INDEX "bottling_source_lotId_idx" ON "bottling_source"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_transfer_lotOperationId_key" ON "vessel_transfer"("lotOperationId");

-- AddForeignKey
ALTER TABLE "vessel_transfer" ADD CONSTRAINT "vessel_transfer_lotOperationId_fkey" FOREIGN KEY ("lotOperationId") REFERENCES "lot_operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_operation" ADD CONSTRAINT "lot_operation_correctsOperationId_fkey" FOREIGN KEY ("correctsOperationId") REFERENCES "lot_operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "lot_operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_lineage" ADD CONSTRAINT "lot_lineage_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_lineage" ADD CONSTRAINT "lot_lineage_childLotId_fkey" FOREIGN KEY ("childLotId") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_group_member" ADD CONSTRAINT "vessel_group_member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "vessel_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_group_member" ADD CONSTRAINT "vessel_group_member_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────────── Ledger invariants enforced at the DB level (D14) ─────────────────
-- Not expressible in the Prisma schema; see docs/INVARIANTS.md. Vessel-capacity is
-- enforced in writeLotOperation under the SERIALIZABLE write lock (needs an aggregate).
ALTER TABLE "vessel_lot" ADD CONSTRAINT "vessel_lot_volume_positive" CHECK ("volumeL" > 0);
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_delta_nonzero" CHECK ("deltaL" <> 0);
