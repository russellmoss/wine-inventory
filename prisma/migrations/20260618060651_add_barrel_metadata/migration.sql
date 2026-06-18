-- AlterTable
ALTER TABLE "vessel" ADD COLUMN     "barrelNumber" INTEGER,
ADD COLUMN     "cooperage" TEXT,
ADD COLUMN     "cooperageYear" INTEGER,
ADD COLUMN     "oakOrigin" TEXT,
ADD COLUMN     "toastLevel" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vessel_barrelNumber_key" ON "vessel"("barrelNumber");
