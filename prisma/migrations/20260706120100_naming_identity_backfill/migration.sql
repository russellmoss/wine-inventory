-- Phase 1 (identity presentation) — data backfill (data-only; runs as the migration OWNER, which is
-- BYPASSRLS, so it spans all tenants — matches "cross-tenant maintenance uses runAsSystem/owner").
-- Idempotent by construction (WHERE NOT EXISTS), so a replay is a no-op. Deterministic rollback
-- markers: the default template's code is the sentinel '__default__'; the seeded identifiers are
-- kind='current-code' AND "sourceSystem" IS NULL — rollback deletes exactly those, never user rows.
--
-- Q12 (user decision): displayName is NOT backfilled to code — it stays NULL and the app coalesces
-- `displayName ?? code`, so a later `code` rename never leaves a stale displayName.
--
-- ROLLBACK:
--   DELETE FROM "lot_identifier" WHERE "kind" = 'current-code' AND "sourceSystem" IS NULL;
--   DELETE FROM "naming_template_version" v USING "naming_template" t
--     WHERE v."templateId" = t."id" AND t."code" = '__default__';
--   DELETE FROM "naming_template" WHERE "code" = '__default__';

-- One built-in default naming template (+ version 1) per tenant. isSystem+isDefault; the renderer
-- delegates the builtin-default spec to buildLotCode for byte-for-byte parity (plan Q6).
WITH ins AS (
  INSERT INTO "naming_template" ("tenantId", "id", "code", "name", "isSystem", "isDefault", "currentVersion", "createdAt", "updatedAt")
  SELECT o."id", gen_random_uuid()::text, '__default__', 'Default lot code', true, true, 1, now(), now()
  FROM "organization" o
  WHERE NOT EXISTS (
    SELECT 1 FROM "naming_template" t WHERE t."tenantId" = o."id" AND t."code" = '__default__'
  )
  RETURNING "tenantId", "id"
)
INSERT INTO "naming_template_version" ("tenantId", "id", "templateId", "version", "spec", "createdAt")
SELECT ins."tenantId", gen_random_uuid()::text, ins."id", 1,
       '{"kind":"builtin-default","engineVersion":1,"lot":["VINTAGE","VINEYARD","BLOCK","SUBBLOCK","VARIETY","TAG"],"blend":["VINTAGE","LITERAL:BL","BLEND_TOKEN"],"separator":"-"}'::jsonb,
       now()
FROM ins;

-- One current-code identifier per existing lot (search index + Phase-3 re-import symmetry). App-native
-- (sourceSystem NULL); protected by the single-current-code partial unique from the schema migration.
INSERT INTO "lot_identifier" ("tenantId", "id", "lotId", "kind", "value", "isCurrent", "createdAt", "updatedAt")
SELECT l."tenantId", gen_random_uuid()::text, l."id", 'current-code', l."code", true, now(), now()
FROM "lot" l
WHERE NOT EXISTS (
  SELECT 1 FROM "lot_identifier" li
  WHERE li."tenantId" = l."tenantId" AND li."lotId" = l."id" AND li."kind" = 'current-code'
);
