-- Plan 098 — Migration B: relax the two per-vineyard unit columns + the audited hoist-if-uniform
-- (council C1 — this REPLACES the draft's blanket backfill-to-NULL).
--
-- Both columns are user-writable today (the WeatherCard toggle, the vineyard modal, the assistant
-- entity editor), so provenance can't be proven from the schema, and a blanket NULL would destroy
-- real intent irreversibly. Instead:
--   1. DROP NOT NULL + DROP DEFAULT on both — NULL becomes a legal value meaning "Auto"
--      (follow the winery's unit prefs, then the geo default for weather).
--   2. Hoist-if-uniform, per tenant, ONLY where every signal agrees: the tenant's weather
--      configs are uniform, its geometry defaults are uniform, the two AGREE on a system, and
--      the tenant master is still NULL. That tenant's master is set, and only rows MATCHING the
--      hoisted value are NULLed (they now resolve identically through the chain).
--   3. Any tenant with mixed values — or whose weather and geometry DISAGREE (the audit found
--      exactly this: weather METRIC + geometry imperial) — is left completely untouched: every
--      per-vineyard value is preserved as an explicit override, and resolved display is
--      byte-identical to before.
--
-- The read-only audit (scripts/audit-unit-prefs-hoist.ts) ran 2026-07-26 before this migration:
--   org_bhutan_wine_co: weather UNIFORM METRIC × 8; geometry UNIFORM imperial × 8 → DISAGREE → preserved.
--   org_demo_winery:    weather UNIFORM IMPERIAL × 6; geometry UNIFORM imperial × 7 → AGREE → hoist IMPERIAL.
-- Shipped only after every reader of these columns is null-safe (same PR, earlier commits).

-- 1) Relax. NULL = "Auto"; nothing is NOT NULL-enforced ever again on these display columns.
ALTER TABLE "vineyard_weather_config" ALTER COLUMN "unitSystem" DROP NOT NULL;
ALTER TABLE "vineyard_weather_config" ALTER COLUMN "unitSystem" DROP DEFAULT;
ALTER TABLE "vineyard_detail" ALTER COLUMN "defaultUnit" DROP NOT NULL;
ALTER TABLE "vineyard_detail" ALTER COLUMN "defaultUnit" DROP DEFAULT;

-- 2) The hoist verdict: one row per tenant where BOTH families are uniform AND agree.
CREATE TEMP TABLE "_unit_hoist" AS
SELECT w."tenantId", w.sys AS "hoistSystem"
FROM (
  SELECT "tenantId", MIN("unitSystem") AS sys
  FROM "vineyard_weather_config"
  GROUP BY "tenantId"
  HAVING COUNT(DISTINCT "unitSystem") = 1
) w
JOIN (
  SELECT "tenantId", MIN("defaultUnit") AS unit
  FROM "vineyard_detail"
  GROUP BY "tenantId"
  HAVING COUNT(DISTINCT "defaultUnit") = 1
) g ON g."tenantId" = w."tenantId"
JOIN "app_settings" s ON s."tenantId" = w."tenantId" AND s."unitSystem" IS NULL
WHERE (w.sys = 'METRIC' AND g.unit = 'metric')
   OR (w.sys = 'IMPERIAL' AND g.unit = 'imperial');

-- 3) Hoist the uniform value to the tenant master…
UPDATE "app_settings" s
SET "unitSystem" = h."hoistSystem"
FROM "_unit_hoist" h
WHERE s."tenantId" = h."tenantId";

-- …and NULL only the rows that MATCH the hoisted value (they resolve identically via the chain).
UPDATE "vineyard_weather_config" c
SET "unitSystem" = NULL
FROM "_unit_hoist" h
WHERE c."tenantId" = h."tenantId" AND c."unitSystem" = h."hoistSystem";

UPDATE "vineyard_detail" d
SET "defaultUnit" = NULL
FROM "_unit_hoist" h
WHERE d."tenantId" = h."tenantId"
  AND d."defaultUnit" = CASE h."hoistSystem" WHEN 'IMPERIAL' THEN 'imperial' ELSE 'metric' END;

DROP TABLE "_unit_hoist";
