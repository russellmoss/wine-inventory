-- Phase 3 cellar operations: treatment detail rows + light material catalog + the
-- group-fan-out batch id. Additive only (no drops). The new OperationType values used
-- at runtime were committed in the preceding enum migration.

-- AlterTable: group fan-out batch id (D13)
ALTER TABLE "lot_operation" ADD COLUMN "batchId" TEXT;

-- CreateTable: cellar_material (catalog; cost/inventory deferred to Phase 8)
CREATE TABLE "cellar_material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "defaultBasis" TEXT,
    "percentActive" DECIMAL(6,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cellar_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable: lot_treatment (detail rows for cellar ops; rides on a lot_operation)
CREATE TABLE "lot_treatment" (
    "id" TEXT NOT NULL,
    "operationId" INTEGER NOT NULL,
    "lotId" TEXT NOT NULL,
    "vesselId" TEXT,
    "kind" TEXT NOT NULL,
    "materialId" TEXT,
    "materialName" TEXT,
    "rateValue" DECIMAL(12,4),
    "rateBasis" TEXT,
    "computedTotal" DECIMAL(12,3),
    "computedUnit" TEXT,
    "volumeLAtAddition" DECIMAL(10,2),
    "durationMin" INTEGER,
    "medium" TEXT,
    "micron" DECIMAL(8,2),
    "note" TEXT,
    "voidedByOperationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_treatment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lot_operation_batchId_idx" ON "lot_operation"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "cellar_material_kind_normalizedKey_key" ON "cellar_material"("kind", "normalizedKey");

-- CreateIndex
CREATE INDEX "lot_treatment_lotId_idx" ON "lot_treatment"("lotId");

-- CreateIndex
CREATE INDEX "lot_treatment_operationId_idx" ON "lot_treatment"("operationId");

-- CreateIndex
CREATE INDEX "lot_treatment_vesselId_idx" ON "lot_treatment"("vesselId");

-- AddForeignKey
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "lot_operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_voidedByOperationId_fkey" FOREIGN KEY ("voidedByOperationId") REFERENCES "lot_operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_treatment" ADD CONSTRAINT "lot_treatment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "cellar_material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
