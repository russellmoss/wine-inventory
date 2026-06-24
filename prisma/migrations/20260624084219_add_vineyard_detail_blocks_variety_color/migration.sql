-- AlterTable
ALTER TABLE "variety" ADD COLUMN     "color" TEXT;

-- CreateTable
CREATE TABLE "vineyard_detail" (
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "gpsLat" DECIMAL(9,6),
    "gpsLng" DECIMAL(9,6),
    "elevationM" DECIMAL(8,2),
    "soilType" TEXT,
    "manager" TEXT,
    "defaultUnit" TEXT NOT NULL DEFAULT 'imperial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vineyard_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vineyard_block" (
    "id" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "blockLabel" TEXT,
    "numRows" INTEGER,
    "rowSpacingM" DECIMAL(10,4),
    "vineSpacingM" DECIMAL(10,4),
    "varietyId" TEXT,
    "clone" TEXT,
    "rootstock" TEXT,
    "vineCount" INTEGER,
    "yearPlanted" INTEGER,
    "irrigated" BOOLEAN,
    "polygon" JSONB,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vineyard_block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vineyard_detail_vineyardId_key" ON "vineyard_detail"("vineyardId");

-- CreateIndex
CREATE INDEX "vineyard_block_vineyardId_idx" ON "vineyard_block"("vineyardId");

-- CreateIndex
CREATE INDEX "vineyard_block_varietyId_idx" ON "vineyard_block"("varietyId");

-- AddForeignKey
ALTER TABLE "vineyard_detail" ADD CONSTRAINT "vineyard_detail_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vineyard_block" ADD CONSTRAINT "vineyard_block_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vineyard_block" ADD CONSTRAINT "vineyard_block_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;
