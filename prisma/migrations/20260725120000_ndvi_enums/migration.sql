-- Vineyard Intelligence P2 (NDVI core) — enums, isolated first (the Windows enum rule).
-- Brand-new CREATE TYPE is safe inside a migration tx; kept in its own migration so the type is committed +
-- deployed before the schema migration that references it (mirrors the isolated-enum convention on this DB).
-- Additive only: five new enum types, no data mutation.

CREATE TYPE "SpatialDatasetStatus" AS ENUM ('INFLIGHT', 'READY', 'FAILED');
CREATE TYPE "SpatialDatasetKind" AS ENUM ('RASTER');
CREATE TYPE "SpatialMetric" AS ENUM ('NDVI');
CREATE TYPE "SpatialJobKind" AS ENUM ('NDVI_SCENE');
CREATE TYPE "SpatialJobStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'PROCESSING', 'COMPLETED', 'FAILED', 'WITHHELD');
