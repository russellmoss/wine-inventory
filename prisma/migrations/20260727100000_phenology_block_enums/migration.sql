-- Spray Intelligence S4 (phenology precision) — enums, isolated first (the Windows enum rule).
-- Brand-new CREATE TYPE is safe inside a migration tx; kept in its own migration so the types are committed +
-- deployed before the schema migration that references them. Additive only: two new enum types, no data mutation.
-- Precedent: 20260725130000_ndvi_display_enums → 20260725130100_ndvi_display_schema.

-- Durable canopy architecture. The S1 leaf-wetness modifier needs the trellis half of
-- "a leaf-pulled VSP canopy" (S4 council S6); the leaf-pulled half is a weekly observation.
CREATE TYPE "TrellisSystem" AS ENUM ('VSP', 'HIGH_WIRE_CORDON', 'SPRAWL', 'GDC', 'SCOTT_HENRY', 'LYRE', 'OTHER');

-- Cluster architecture drives the botrytis/sour-rot microclimate. Variety carries the default
-- (Pinot Noir tight, Cabernet Sauvignon loose); a block may override it for clone/site (S4 D12).
CREATE TYPE "ClusterCompactness" AS ENUM ('LOOSE', 'MODERATE', 'TIGHT');
