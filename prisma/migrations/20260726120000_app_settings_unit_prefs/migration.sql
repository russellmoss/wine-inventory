-- Plan 098 — tenant display-unit preferences (Migration A: additive ONLY).
--
-- Wineries on both sides of the metric line run this app; each expects its own units
-- (°F + gallons in Oregon, °C + litres in Marlborough, hL in the EU). Canonical storage is
-- metric everywhere and STAYS metric — these columns steer display conversion at the edge.
--
-- Shape: a master `unitSystem` ("METRIC" | "IMPERIAL") plus six per-dimension overrides.
-- All NULLABLE with no defaults, on purpose. NULL master + NULL overrides means "not
-- configured": every reader falls back to exactly today's behavior, so this migration
-- changes nothing on its own for any existing tenant. Per-dimension NULL means "follow the
-- master" (mixed regimes are real: a Canadian winery wants °C but gallons).
--
-- String unions, NOT Postgres enums — the coverageState / VineyardWeatherConfig.unitSystem
-- precedent. Values are validated strictly on write (setUnitPrefs) and parsed permissively
-- on read (resolveUnitPrefs); an unknown stored value degrades to the fallback rather than
-- breaking a render.
--
-- The two existing per-vineyard unit columns (VineyardWeatherConfig.unitSystem,
-- VineyardDetail.defaultUnit) are NOT touched here. Their relaxation to nullable overrides
-- is Migration B, which ships only after readers are null-safe and the tenant-data audit
-- script has run (council C1 phase split).
--
-- No new table, so the Phase-12 RLS checklist does not apply — `app_settings` already has
-- tenantId + FK + FORCE ROW LEVEL SECURITY, and the tenant_isolation policy is row-level,
-- so it covers new columns automatically.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN "unitSystem" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "unitTemperature" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "unitPrecipitation" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "unitVolume" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "unitArea" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "unitLength" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "unitWeight" TEXT;
