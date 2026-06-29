-- CreateEnum
CREATE TYPE "BlendTrialStatus" AS ENUM ('DRAFT', 'CHOSEN', 'PROMOTED', 'DISCARDED');

-- AlterTable

-- AlterTable
ALTER TABLE "lot" ADD COLUMN     "provenanceComplete" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "lot_vineyard" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_vineyard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vineyard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_vineyard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blend_trial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetWine" TEXT,
    "note" TEXT,
    "baseVolume" DECIMAL(12,3),
    "baseUnit" TEXT,
    "status" "BlendTrialStatus" NOT NULL DEFAULT 'DRAFT',
    "score" INTEGER,
    "scoreScale" "TastingScoreScale",
    "readiness" "TastingReadiness",
    "tastingNotes" TEXT,
    "chosenAt" TIMESTAMP(3),
    "promotedToLotId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blend_trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blend_trial_component" (
    "id" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "proportion" DECIMAL(6,5),
    "volume" DECIMAL(12,3),
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blend_trial_component_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lot_vineyard_vineyardId_idx" ON "lot_vineyard"("vineyardId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_vineyard_lotId_vineyardId_key" ON "lot_vineyard"("lotId", "vineyardId");

-- CreateIndex
CREATE INDEX "user_vineyard_vineyardId_idx" ON "user_vineyard"("vineyardId");

-- CreateIndex
CREATE UNIQUE INDEX "user_vineyard_userId_vineyardId_key" ON "user_vineyard"("userId", "vineyardId");

-- CreateIndex
CREATE INDEX "blend_trial_status_idx" ON "blend_trial"("status");

-- CreateIndex
CREATE INDEX "blend_trial_promotedToLotId_idx" ON "blend_trial"("promotedToLotId");

-- CreateIndex
CREATE INDEX "blend_trial_component_lotId_idx" ON "blend_trial_component"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "blend_trial_component_trialId_lotId_key" ON "blend_trial_component"("trialId", "lotId");

-- AddForeignKey
ALTER TABLE "lot_vineyard" ADD CONSTRAINT "lot_vineyard_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_vineyard" ADD CONSTRAINT "lot_vineyard_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vineyard" ADD CONSTRAINT "user_vineyard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vineyard" ADD CONSTRAINT "user_vineyard_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blend_trial" ADD CONSTRAINT "blend_trial_promotedToLotId_fkey" FOREIGN KEY ("promotedToLotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blend_trial_component" ADD CONSTRAINT "blend_trial_component_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "blend_trial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blend_trial_component" ADD CONSTRAINT "blend_trial_component_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────── Phase 5 hand-authored additions ───────────────────────

-- CHECK (council S4 mirror): a bench trial's score and scale are present together or neither.
ALTER TABLE "blend_trial"
  ADD CONSTRAINT "blend_trial_score_scale_ck"
  CHECK (("score" IS NULL) = ("scoreScale" IS NULL));

-- CHECK: a trial component's proportion, when set, is a real share in (0,1].
ALTER TABLE "blend_trial_component"
  ADD CONSTRAINT "blend_trial_component_proportion_ck"
  CHECK ("proportion" IS NULL OR ("proportion" > 0 AND "proportion" <= 1));

-- BACKFILL (eng-review P1 — non-optional): populate lot_vineyard for EVERY existing lot
-- from its origin vineyard. No legacy blends exist yet, so an origin-based backfill is
-- complete. A lot with no resolvable origin vineyard gets ZERO rows — the defined
-- "NULL-source / admin-only-visible" bucket — never silently hidden from everyone.
INSERT INTO "lot_vineyard" ("id", "lotId", "vineyardId", "createdAt")
SELECT gen_random_uuid()::text, l."id", l."originVineyardId", CURRENT_TIMESTAMP
FROM "lot" l
WHERE l."originVineyardId" IS NOT NULL
ON CONFLICT ("lotId", "vineyardId") DO NOTHING;

-- Legacy lots whose origin vineyard lives only in the JSON snapshot — resolve by name.
INSERT INTO "lot_vineyard" ("id", "lotId", "vineyardId", "createdAt")
SELECT gen_random_uuid()::text, l."id", v."id", CURRENT_TIMESTAMP
FROM "lot" l
JOIN "vineyard" v ON v."name" = (l."legacySnapshot"->>'vineyardName')
WHERE l."originVineyardId" IS NULL
  AND l."legacySnapshot" IS NOT NULL
  AND (l."legacySnapshot"->>'vineyardName') IS NOT NULL
ON CONFLICT ("lotId", "vineyardId") DO NOTHING;
