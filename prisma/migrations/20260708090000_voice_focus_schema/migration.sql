-- Voice Focus / speaker recognition v1.
--
-- Two new tenant-scoped per-user tables:
--   voice_profile    encrypted derived voiceprint/provider reference, no raw audio
--   voice_preference default session mode + voice cleanup flags
--
-- Phase-12 checklist: tenantId NOT NULL from creation, tenantId -> organization FK,
-- per-tenant uniques, ENABLE+FORCE RLS, tenant_isolation USING/WITH CHECK, app_rls grants.

SET lock_timeout = '5s';

CREATE TYPE "VoiceProfileStatus" AS ENUM ('ACTIVE', 'DISABLED', 'NEEDS_REENROLL');
CREATE TYPE "VoiceProfileProvider" AS ENUM ('LOCAL_VOICEPRINT', 'VENDOR_REF');
CREATE TYPE "VoiceFocusDefaultMode" AS ENUM ('OPEN', 'MY_VOICE', 'TEAM_SESSION');

CREATE TABLE "voice_profile" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "VoiceProfileStatus" NOT NULL DEFAULT 'ACTIVE',
  "provider" "VoiceProfileProvider" NOT NULL DEFAULT 'LOCAL_VOICEPRINT',
  "providerRef" TEXT,
  "embeddingCt" TEXT,
  "dekWrapped" TEXT,
  "modelVersion" TEXT NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.82,
  "enrollmentQuality" DOUBLE PRECISION,
  "consentAcceptedAt" TIMESTAMP(3),
  "consentVersion" TEXT,
  "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "voice_profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_preference" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "defaultFocusMode" "VoiceFocusDefaultMode" NOT NULL DEFAULT 'OPEN',
  "audioIsolationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "wakeWordEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "voice_preference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_profile_tenantId_userId_key" ON "voice_profile"("tenantId", "userId");
CREATE UNIQUE INDEX "voice_profile_tenantId_id_key" ON "voice_profile"("tenantId", "id");
CREATE INDEX "voice_profile_tenantId_idx" ON "voice_profile"("tenantId");
CREATE INDEX "voice_profile_tenantId_userId_idx" ON "voice_profile"("tenantId", "userId");

CREATE UNIQUE INDEX "voice_preference_tenantId_userId_key" ON "voice_preference"("tenantId", "userId");
CREATE UNIQUE INDEX "voice_preference_tenantId_id_key" ON "voice_preference"("tenantId", "id");
CREATE INDEX "voice_preference_tenantId_idx" ON "voice_preference"("tenantId");
CREATE INDEX "voice_preference_tenantId_userId_idx" ON "voice_preference"("tenantId", "userId");

ALTER TABLE "voice_profile" ADD CONSTRAINT "voice_profile_tenantId_id_key" UNIQUE USING INDEX "voice_profile_tenantId_id_key";
ALTER TABLE "voice_preference" ADD CONSTRAINT "voice_preference_tenantId_id_key" UNIQUE USING INDEX "voice_preference_tenantId_id_key";

ALTER TABLE "voice_profile" ADD CONSTRAINT "voice_profile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_preference" ADD CONSTRAINT "voice_preference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_profile" ADD CONSTRAINT "voice_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_preference" ADD CONSTRAINT "voice_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voice_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "voice_profile" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "voice_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voice_preference" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "voice_preference" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "voice_profile" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "voice_preference" TO app_rls;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['voice_profile', 'voice_preference'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', r;
    END IF;
  END LOOP;
END
$$;
