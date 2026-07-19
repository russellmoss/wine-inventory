// Sentry Session Replay helpers (Plan 080).
//
// Pure, isomorphic helpers so they're unit-testable without the Sentry SDK or a DOM.
// Phase 1 uses buildReplayUrl to deep-link a bug report to its replay. Phase 2 will add
// the fidelity/option builders (resolveReplayFidelity / buildReplayOptions) to this file.

/**
 * Sentry org slug for building replay deep-links. Client-exposed by design (NEXT_PUBLIC_*).
 * Defaults to the current org so the link works even if the env var isn't set.
 */
export const SENTRY_ORG_SLUG = process.env.NEXT_PUBLIC_SENTRY_ORG_SLUG || "bhutan-wine";

/**
 * Build a Sentry replay deep-link. Returns undefined when either input is missing so callers
 * can simply omit the link rather than emit a broken URL. Pure — no env, no SDK.
 */
export function buildReplayUrl(orgSlug: string | undefined, replayId: string | undefined): string | undefined {
  if (!orgSlug || !replayId) return undefined;
  return `https://${orgSlug}.sentry.io/replays/${replayId}/`;
}
