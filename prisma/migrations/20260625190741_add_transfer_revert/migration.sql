-- AlterTable
ALTER TABLE "vessel_transfer" ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertsId" TEXT;

-- CreateIndex
CREATE INDEX "vessel_transfer_revertsId_idx" ON "vessel_transfer"("revertsId");

-- AddForeignKey
ALTER TABLE "vessel_transfer" ADD CONSTRAINT "vessel_transfer_revertsId_fkey" FOREIGN KEY ("revertsId") REFERENCES "vessel_transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
