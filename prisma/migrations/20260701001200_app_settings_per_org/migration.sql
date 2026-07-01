-- Phase 12 Unit 10: AppSettings is per-org now. The id was DEFAULT 'singleton' (single-tenant);
-- drop that default so a second org's row can't collide on the PK — Prisma now supplies a cuid
-- client-side. The existing Bhutan row keeps its id 'singleton' (harmless); it is found by tenantId.
ALTER TABLE "app_settings" ALTER COLUMN "id" DROP DEFAULT;
