-- Readable lot codes + abbreviations (plan 017, Phase A schema).
-- Additive only. `abbreviation` is nullable; in Postgres a UNIQUE index on a nullable
-- column allows multiple NULLs and enforces uniqueness only on non-null values, so this
-- is safe to add before backfilling.

-- AlterTable
ALTER TABLE "lot" ADD COLUMN     "sublotTag" TEXT;

-- AlterTable
ALTER TABLE "variety" ADD COLUMN     "abbreviation" TEXT;

-- AlterTable
ALTER TABLE "vineyard" ADD COLUMN     "abbreviation" TEXT;

-- AlterTable
ALTER TABLE "vineyard_block" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "variety_abbreviation_key" ON "variety"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "vineyard_abbreviation_key" ON "vineyard"("abbreviation");
