-- DropIndex
DROP INDEX "vessel_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "vessel_type_code_key" ON "vessel"("type", "code");
