-- Phase 12 Unit 1: Better Auth organization plugin (tenant model) + seed Bhutan as tenant #1.
-- Global tables (no tenantId, no RLS). Column names are camelCase to match the Better Auth
-- adapter + the existing auth tables. Hand-authored (Windows/Neon; migrate dev is broken).

-- CreateTable organization
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable member (user <-> org join; multi-org capable)
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable invitation (tables adopted now; the invite UX is the deferred slice)
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");
CREATE INDEX "member_userId_idx" ON "member"("userId");
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- Session: the active organization (the tenant) for the request. Plain string, no FK (matches
-- the Better Auth plugin schema).
ALTER TABLE "session" ADD COLUMN "activeOrganizationId" TEXT;

-- Foreign keys
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────── Seed: Bhutan Wine Company as tenant #1 ───────────────────────
-- Fixed org id so the Unit 3 backfill can reference the tenant deterministically. Idempotent.
INSERT INTO "organization" ("id", "name", "slug", "createdAt")
VALUES ('org_bhutan_wine_co', 'Bhutan Wine Company', 'bhutan-wine-company', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Every existing user becomes a member (app admins map to org owners, everyone else to member).
INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt")
SELECT gen_random_uuid()::text, 'org_bhutan_wine_co', u."id",
       CASE WHEN u."role" = 'admin' THEN 'owner' ELSE 'member' END, CURRENT_TIMESTAMP
FROM "user" u
ON CONFLICT ("organizationId", "userId") DO NOTHING;

-- Point every existing session at the tenant (so live sessions keep working post-migration).
UPDATE "session" SET "activeOrganizationId" = 'org_bhutan_wine_co' WHERE "activeOrganizationId" IS NULL;
