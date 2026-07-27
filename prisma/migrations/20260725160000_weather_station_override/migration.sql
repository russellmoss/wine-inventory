-- VI-P8 follow-on — grower-chosen weather station (map picker). Additive: ONE nullable column on the existing
-- (already RLS-isolated) vineyard_weather_config. When set, ingest fetches THIS ACIS station instead of the
-- auto-nearest. No new table, no RLS change. Applied via `migrate deploy`.
ALTER TABLE "vineyard_weather_config" ADD COLUMN "stationOverrideId" TEXT;
