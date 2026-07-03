// Phase 15 Unit 3 — QBO endpoint + env config. SEC-S3: the Intuit token/revoke/authorize origins are
// HARDCODED HTTPS constants here (never derived from a request header), and every fetch disables
// redirect-following. The API base is chosen by the connection's environment (sandbox vs production),
// never trusted from the client.

export type ProviderEnvironment = "sandbox" | "production";

/** Fixed Intuit OAuth2 origins — the ONLY hosts these modules ever talk to (locked egress, SEC-S3). */
export const INTUIT = {
  authorize: "https://appcenter.intuit.com/connect/oauth2",
  token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revoke: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
} as const;

/** The QBO v3 API base per environment. */
export function apiBase(env: ProviderEnvironment): string {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/** Pinned QBO minorversion (research: pin it so response shapes don't drift under us). */
export function minorVersion(): string {
  return process.env.QBO_MINOR_VERSION || "75";
}

export type QboAppConfig = {
  clientId: string;
  clientSecret: string;
  environment: ProviderEnvironment;
  redirectUri: string;
};

/**
 * Read the QBO app credentials from env. Throws (fail-closed) if unset — a missing secret must never
 * silently degrade to an unauthenticated call. Never logs the values.
 */
export function loadQboConfig(): QboAppConfig {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const environment = (process.env.QBO_ENVIRONMENT || "sandbox") as ProviderEnvironment;
  if (!clientId || !clientSecret) throw new Error("QBO_CLIENT_ID / QBO_CLIENT_SECRET are not set.");
  if (!redirectUri) throw new Error("QBO_REDIRECT_URI is not set.");
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error(`QBO_ENVIRONMENT must be 'sandbox' or 'production' (got '${environment}').`);
  }
  return { clientId, clientSecret, environment, redirectUri };
}

/**
 * SEC-S1/S2: the redirect_uri MUST come from a hardcoded per-environment allowlist, never from a
 * request Host/X-Forwarded-Host. We allow exactly the configured QBO_REDIRECT_URI. Returns it only if
 * it is on the allowlist; throws otherwise.
 */
export function assertAllowedRedirectUri(uri: string): string {
  const allowed = new Set([process.env.QBO_REDIRECT_URI].filter(Boolean) as string[]);
  if (!allowed.has(uri)) throw new Error("redirect_uri is not on the allowlist.");
  return uri;
}
