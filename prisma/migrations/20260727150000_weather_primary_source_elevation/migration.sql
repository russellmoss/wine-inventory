-- Weather source fidelity: record the elevation the PRIMARY daily series actually describes.
--
-- NASA POWER answers with its grid cell's MEAN elevation, which it publishes in
-- geometry.coordinates[2] and which this app previously discarded. At the Bhutan Wine Co. vineyards
-- that cell sits 1.0-1.8 km above the vines, so the stored series ran 4.8-9.7 C cold and the grower
-- was shown Winkler Region I at a Region V site (docs/analysis/bhutan-nasa-power-elevation-bias.md).
-- Storing the source's own reported elevation lets source-fidelity-core compare it against
-- siteElevationM and REFUSE the temperature-derived classifications instead of mislabelling them.
--
-- ADDITIVE ONLY: one nullable column. No FK, no RLS change, no uniqueness change, no backfill
-- required -- NULL means "the provider does not publish it", which is a first-class state.

ALTER TABLE "vineyard_weather_config"
  ADD COLUMN IF NOT EXISTS "primarySourceElevationM" DECIMAL(10,2);
