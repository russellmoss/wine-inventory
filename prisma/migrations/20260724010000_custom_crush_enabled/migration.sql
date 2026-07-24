-- Plan 093 follow-on: AppSettings.customCrushEnabled — the feature flag that gates the custom-crush
-- surfaces (Owners/Clients setup + the Weigh-tags nav). Additive, NOT NULL with a default (metadata-only);
-- default false so existing wineries stay inert until they opt in. Mirrors sparklingEnabled.
ALTER TABLE "app_settings" ADD COLUMN "customCrushEnabled" BOOLEAN NOT NULL DEFAULT false;
