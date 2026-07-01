-- CreateEnum
CREATE TYPE "SparklingMethod" AS ENUM ('TRADITIONAL', 'TANK', 'PETNAT');

-- CreateEnum
CREATE TYPE "BottleStage" AS ENUM ('EN_TIRAGE', 'RIDDLING', 'DISGORGED', 'DOSED');

-- CreateEnum
CREATE TYPE "DosageStyle" AS ENUM ('BRUT_NATURE', 'EXTRA_BRUT', 'BRUT', 'EXTRA_DRY', 'SEC', 'DEMI_SEC', 'DOUX');

-- CreateEnum
CREATE TYPE "LedgerBucket" AS ENUM ('VESSEL', 'EXTERNAL', 'BOTTLE_STORAGE');

-- DropIndex
DROP INDEX "wine_sku_name_vintage_bottleSizeMl_key";

-- AlterTable

-- AlterTable
ALTER TABLE "bottling_run" ADD COLUMN     "disgorgedAt" TIMESTAMP(3),
ADD COLUMN     "dosageGramsPerL" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "bottling_source" ALTER COLUMN "vesselId" DROP NOT NULL,
ALTER COLUMN "varietyId" DROP NOT NULL,
ALTER COLUMN "vineyardId" DROP NOT NULL,
ALTER COLUMN "vintage" DROP NOT NULL;

-- AlterTable
ALTER TABLE "lot_operation_line" ADD COLUMN     "bottleDelta" INTEGER,
ADD COLUMN     "bucket" "LedgerBucket" NOT NULL DEFAULT 'EXTERNAL';

-- AlterTable
ALTER TABLE "wine_sku" ADD COLUMN     "dosageStyle" "DosageStyle",
ADD COLUMN     "isNonVintage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "method" "SparklingMethod",
ALTER COLUMN "vintage" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sparklingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottled_lot_state" (
    "lotId" TEXT NOT NULL,
    "bottleCount" INTEGER NOT NULL,
    "nominalFillMl" INTEGER NOT NULL DEFAULT 750,
    "volumeL" DECIMAL(10,2) NOT NULL,
    "method" "SparklingMethod" NOT NULL,
    "stage" "BottleStage" NOT NULL,
    "tirageAt" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT,
    "tirageSugarAddedGpl" DECIMAL(6,2),
    "disgorgedAt" TIMESTAMP(3),
    "disgorgementRunId" TEXT,
    "dosageStyle" "DosageStyle",
    "dosageGramsPerL" DECIMAL(6,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bottled_lot_state_pkey" PRIMARY KEY ("lotId")
);

-- CreateIndex
CREATE INDEX "bottled_lot_state_locationId_idx" ON "bottled_lot_state"("locationId");

-- CreateIndex
CREATE INDEX "bottled_lot_state_stage_idx" ON "bottled_lot_state"("stage");

-- CreateIndex
CREATE INDEX "bottled_lot_state_disgorgementRunId_idx" ON "bottled_lot_state"("disgorgementRunId");

-- AddForeignKey
ALTER TABLE "bottled_lot_state" ADD CONSTRAINT "bottled_lot_state_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottled_lot_state" ADD CONSTRAINT "bottled_lot_state_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────── Phase 7 hand-authored: backfill + CHECKs + partial unique indexes (D14) ───────────────

-- Backfill the ledger-line bucket discriminator on existing rows: VESSEL where the leg sits
-- in a vessel, else EXTERNAL (the column default already set EXTERNAL). bottleDelta stays NULL
-- on every existing row, which is consistent with the pairing CHECK added below.
UPDATE "lot_operation_line" SET "bucket" = 'VESSEL' WHERE "vesselId" IS NOT NULL;

-- The bottle-count / volume dimensions of a bottled lot are non-negative (K3/K6).
ALTER TABLE "bottled_lot_state" ADD CONSTRAINT "bottled_lot_state_bottleCount_nonneg" CHECK ("bottleCount" >= 0);
ALTER TABLE "bottled_lot_state" ADD CONSTRAINT "bottled_lot_state_volumeL_nonneg" CHECK ("volumeL" >= 0);

-- The nullability trap closer (K3): a BOTTLE_STORAGE leg MUST carry a bottleDelta, and every
-- other leg MUST have bottleDelta NULL. Boolean equality makes it a strict iff.
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_bottle_bucket_pairing"
  CHECK (("bucket" = 'BOTTLE_STORAGE') = ("bottleDelta" IS NOT NULL));

-- NV uniqueness (K11): Postgres treats NULLs as distinct, so a plain compound unique on a
-- nullable vintage would let NV runs create duplicate SKUs. Two PARTIAL unique indexes dedupe
-- vintaged and NV SKUs each on their own terms. (Partial indexes aren't expressible in the
-- Prisma schema, so they live only here — a later `migrate diff` will try to DROP them; strip
-- those lines like the phantom search_vector diff.)
CREATE UNIQUE INDEX "wine_sku_name_vintage_bottleSizeMl_key"
  ON "wine_sku" ("name", "vintage", "bottleSizeMl") WHERE "vintage" IS NOT NULL;
CREATE UNIQUE INDEX "wine_sku_name_bottleSizeMl_nv_key"
  ON "wine_sku" ("name", "bottleSizeMl") WHERE "isNonVintage";

