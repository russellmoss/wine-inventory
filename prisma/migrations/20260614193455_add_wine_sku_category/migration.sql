-- AlterTable
ALTER TABLE "wine_sku" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "wine_sku_categoryId_idx" ON "wine_sku"("categoryId");

-- AddForeignKey
ALTER TABLE "wine_sku" ADD CONSTRAINT "wine_sku_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finished_good_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
