-- Vineyard Intelligence P3 (NDVI display) — enums, isolated first (the Windows enum rule).
-- Brand-new CREATE TYPE is safe inside a migration tx; kept in its own migration so the types are committed +
-- deployed before the schema migration that references them. Additive only: two new enum types, no data mutation.

CREATE TYPE "SpatialDerivativeKind" AS ENUM ('DISPLAY_NDVI', 'SMOOTHED_NDVI');
CREATE TYPE "SpatialStyleScope" AS ENUM ('SYSTEM', 'VINEYARD');
