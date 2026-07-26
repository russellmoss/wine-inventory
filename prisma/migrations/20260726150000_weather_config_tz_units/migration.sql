-- Plan 096 Phase 0 Unit 1 — per-vineyard timezone + display unit system + history top-up stamp.
-- Additive columns on the already-RLS'd vineyard_weather_config (TENANT-1 unchanged: policies
-- are row-scoped, new columns inherit them). Backfill-then-default (live-tenant rule):
--   • unitSystem backfills IMPERIAL where coverageState='US_HIGH_RES' — correct for every EXISTING
--     row (the legacy CONUS bbox is a strict subset of US forecast coverage, and no AK/HI/territory
--     vineyard exists in data today). New configs default via the us-coverage helper at create time
--     (council S2 — the broader NWS bboxes), not this column.
--   • timeZone stays NULL until the first forecast ingest reports it (NWS points.timeZone /
--     Open-Meteo timezone=auto); readers fall back AppSettings.timeZone → UTC.
ALTER TABLE "vineyard_weather_config" ADD COLUMN "timeZone" TEXT;
ALTER TABLE "vineyard_weather_config" ADD COLUMN "unitSystem" TEXT NOT NULL DEFAULT 'METRIC';
ALTER TABLE "vineyard_weather_config" ADD COLUMN "lastHistoryTopUpAt" TIMESTAMP(3);

UPDATE "vineyard_weather_config" SET "unitSystem" = 'IMPERIAL' WHERE "coverageState" = 'US_HIGH_RES';
