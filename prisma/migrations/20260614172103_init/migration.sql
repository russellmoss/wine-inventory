-- CreateEnum
CREATE TYPE "VesselType" AS ENUM ('BARREL', 'TANK');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('BOTTLED_WINE', 'FINISHED_GOOD');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('RECEIVE', 'ADJUST', 'TRANSFER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PASSWORD_RESET', 'PASSWORD_CHANGE', 'USER_CREATED', 'USER_DELETED', 'BOTTLING', 'STOCK_MOVEMENT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variety" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vineyard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vineyard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "VesselType" NOT NULL,
    "capacityL" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessel_component" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "vintage" INTEGER NOT NULL,
    "volumeL" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessel_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wine_sku" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vintage" INTEGER NOT NULL,
    "bottleSizeMl" INTEGER NOT NULL DEFAULT 750,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wine_sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottling_run" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "wineSkuId" TEXT NOT NULL,
    "bottlesProduced" INTEGER NOT NULL,
    "volumeConsumedL" DECIMAL(10,2) NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bottling_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottling_source" (
    "id" TEXT NOT NULL,
    "bottlingRunId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "vineyardId" TEXT NOT NULL,
    "vintage" INTEGER NOT NULL,
    "volumeConsumedL" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "bottling_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "itemKind" "ItemKind" NOT NULL,
    "wineSkuId" TEXT,
    "finishedGoodId" TEXT,
    "locationId" TEXT NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "deltaUnits" INTEGER NOT NULL,
    "reason" TEXT,
    "transferGroupId" TEXT,
    "bottlingRunId" TEXT,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottled_inventory" (
    "id" TEXT NOT NULL,
    "wineSkuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "totalBottles" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bottled_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_good_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finished_good_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_good" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finished_good_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_good_inventory" (
    "id" TEXT NOT NULL,
    "finishedGoodId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finished_good_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "summary" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "location_name_key" ON "location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "variety_name_key" ON "variety"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vineyard_name_key" ON "vineyard"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_code_key" ON "vessel"("code");

-- CreateIndex
CREATE INDEX "vessel_component_vesselId_idx" ON "vessel_component"("vesselId");

-- CreateIndex
CREATE INDEX "vessel_component_varietyId_idx" ON "vessel_component"("varietyId");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_component_vesselId_varietyId_vineyardId_vintage_key" ON "vessel_component"("vesselId", "varietyId", "vineyardId", "vintage");

-- CreateIndex
CREATE UNIQUE INDEX "wine_sku_name_vintage_bottleSizeMl_key" ON "wine_sku"("name", "vintage", "bottleSizeMl");

-- CreateIndex
CREATE INDEX "bottling_run_wineSkuId_idx" ON "bottling_run"("wineSkuId");

-- CreateIndex
CREATE INDEX "bottling_run_date_idx" ON "bottling_run"("date");

-- CreateIndex
CREATE INDEX "bottling_source_bottlingRunId_idx" ON "bottling_source"("bottlingRunId");

-- CreateIndex
CREATE INDEX "bottling_source_vesselId_idx" ON "bottling_source"("vesselId");

-- CreateIndex
CREATE INDEX "stock_movement_wineSkuId_idx" ON "stock_movement"("wineSkuId");

-- CreateIndex
CREATE INDEX "stock_movement_finishedGoodId_idx" ON "stock_movement"("finishedGoodId");

-- CreateIndex
CREATE INDEX "stock_movement_locationId_idx" ON "stock_movement"("locationId");

-- CreateIndex
CREATE INDEX "stock_movement_createdAt_idx" ON "stock_movement"("createdAt");

-- CreateIndex
CREATE INDEX "stock_movement_transferGroupId_idx" ON "stock_movement"("transferGroupId");

-- CreateIndex
CREATE INDEX "bottled_inventory_locationId_idx" ON "bottled_inventory"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "bottled_inventory_wineSkuId_locationId_key" ON "bottled_inventory"("wineSkuId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "finished_good_category_name_key" ON "finished_good_category"("name");

-- CreateIndex
CREATE INDEX "finished_good_categoryId_idx" ON "finished_good"("categoryId");

-- CreateIndex
CREATE INDEX "finished_good_inventory_locationId_idx" ON "finished_good_inventory"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "finished_good_inventory_finishedGoodId_locationId_key" ON "finished_good_inventory"("finishedGoodId", "locationId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_idx" ON "audit_log"("actorUserId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_component" ADD CONSTRAINT "vessel_component_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_component" ADD CONSTRAINT "vessel_component_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_component" ADD CONSTRAINT "vessel_component_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_wineSkuId_fkey" FOREIGN KEY ("wineSkuId") REFERENCES "wine_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_bottlingRunId_fkey" FOREIGN KEY ("bottlingRunId") REFERENCES "bottling_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_vineyardId_fkey" FOREIGN KEY ("vineyardId") REFERENCES "vineyard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_wineSkuId_fkey" FOREIGN KEY ("wineSkuId") REFERENCES "wine_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_finishedGoodId_fkey" FOREIGN KEY ("finishedGoodId") REFERENCES "finished_good"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_bottlingRunId_fkey" FOREIGN KEY ("bottlingRunId") REFERENCES "bottling_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottled_inventory" ADD CONSTRAINT "bottled_inventory_wineSkuId_fkey" FOREIGN KEY ("wineSkuId") REFERENCES "wine_sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottled_inventory" ADD CONSTRAINT "bottled_inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_good" ADD CONSTRAINT "finished_good_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finished_good_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_good_inventory" ADD CONSTRAINT "finished_good_inventory_finishedGoodId_fkey" FOREIGN KEY ("finishedGoodId") REFERENCES "finished_good"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_good_inventory" ADD CONSTRAINT "finished_good_inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data-integrity CHECK constraints (council review)
ALTER TABLE "vessel" ADD CONSTRAINT "vessel_capacityL_positive" CHECK ("capacityL" > 0);
ALTER TABLE "vessel_component" ADD CONSTRAINT "vessel_component_volumeL_nonneg" CHECK ("volumeL" >= 0);
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_bottles_nonneg" CHECK ("bottlesProduced" >= 0);
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_volume_nonneg" CHECK ("volumeConsumedL" >= 0);
ALTER TABLE "bottling_source" ADD CONSTRAINT "bottling_source_volume_nonneg" CHECK ("volumeConsumedL" >= 0);
ALTER TABLE "bottled_inventory" ADD CONSTRAINT "bottled_inventory_total_nonneg" CHECK ("totalBottles" >= 0);
ALTER TABLE "finished_good_inventory" ADD CONSTRAINT "finished_good_inventory_qty_nonneg" CHECK ("quantity" >= 0);
