// Plan 068 (CEO note) — the inbox UI feature flag. Unit 1b's `app.user_id` GUC + the schema are always
// live (harmless, fail-closed), but the SURFACE (avatar badge + /inbox route) is gated so the feature
// can be dark-shipped after merge and enabled deliberately. Default ON (so QA + normal use work);
// set INBOX_ENABLED=0 in an environment to hide the surface there.
export function isInboxEnabled(): boolean {
  return process.env.INBOX_ENABLED !== "0";
}
