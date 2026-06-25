-- CreateTable
CREATE TABLE "vessel_transfer" (
    "id" TEXT NOT NULL,
    "fromVesselId" TEXT,
    "toVesselId" TEXT,
    "fromVesselCode" TEXT NOT NULL,
    "toVesselCode" TEXT NOT NULL,
    "volumeL" DECIMAL(10,2) NOT NULL,
    "lossL" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "components" JSONB NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "rackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vessel_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vessel_transfer_fromVesselId_rackedAt_idx" ON "vessel_transfer"("fromVesselId", "rackedAt");

-- CreateIndex
CREATE INDEX "vessel_transfer_toVesselId_rackedAt_idx" ON "vessel_transfer"("toVesselId", "rackedAt");

-- CreateIndex
CREATE INDEX "vessel_transfer_rackedAt_idx" ON "vessel_transfer"("rackedAt");

-- AddForeignKey
ALTER TABLE "vessel_transfer" ADD CONSTRAINT "vessel_transfer_fromVesselId_fkey" FOREIGN KEY ("fromVesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_transfer" ADD CONSTRAINT "vessel_transfer_toVesselId_fkey" FOREIGN KEY ("toVesselId") REFERENCES "vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
