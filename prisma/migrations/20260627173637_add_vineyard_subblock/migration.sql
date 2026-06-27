-- AlterTable

-- AlterTable
ALTER TABLE "lot" ADD COLUMN     "originSubblockId" TEXT;

-- CreateTable
CREATE TABLE "vineyard_subblock" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vineyard_subblock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vineyard_subblock_blockId_idx" ON "vineyard_subblock"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "vineyard_subblock_blockId_code_key" ON "vineyard_subblock"("blockId", "code");

-- AddForeignKey
ALTER TABLE "vineyard_subblock" ADD CONSTRAINT "vineyard_subblock_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "vineyard_block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

