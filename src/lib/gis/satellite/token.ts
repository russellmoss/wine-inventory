import "server-only";

/**
 * Vineyard Intelligence — CDSE OAuth2 client-credentials token cache.
 *
 * WHY THIS IS SO MUCH SMALLER THAN `src/lib/accounting/token.ts`. That module carries a row lock,
 * a `tokenVersion` CAS, and envelope encryption at rest, all because QBO's refresh token ROTATES:
 * two concurrent refreshes would invalidate each other, so the refresh has to be serialised across
 * processes and the new secret persisted.
 *
 * Client credentials has no refresh token and nothing to persist. A concurrent double-fetch is
 * harmless (both tokens are valid), so the machinery would be pure ceremony. This is a deliberate
 * simplification, stated here so a reviewer does not read it as an oversight.
 *
 * The one thing we DO keep: never fetch per request. CDSE rate-limits the token endpoint separately
 * and returns HTTP 429 if you ask too often, so a per-raster token fetch would break under exactly
 * the load we care about.
 */
import { CDSE, TOKEN_SKEW_MS, loadSatelliteConfig } from "./config";

type Cached = { token: string; expiresAtMs: number };

/** Process-global, in-memory only. Never persisted (SEC-N2 posture from the QBO module). */
let cached: Cached | null = null;

/** Test seam, mirroring `_clearAccessCache` in the accounting module. */
export function _clearTokenCache(): void {
  cached = null;
}

/** Test seam. */
export function _seedTokenCache(token: string, ttlMs = 1_800_000): void {
  cached = { token, expiresAtMs: Date.now() + ttlMs };
}

export type TokenDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
};

export class SatelliteAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SatelliteAuthError";
  }
}

/**
 * A valid bearer token, cached until it is within the skew window of expiry.
 *
 * `expires_in` is READ FROM THE RESPONSE rather than hardcoded. CDSE documents no fixed lifetime and
 * says the truth lives in the token's own `exp` claim; we measured 1800 s on 2026-07-24 but treating
 * that as a constant would silently break if they change it.
 */
export async function getAccessToken(deps: TokenDeps = {}): Promise<string> {
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchImpl ?? fetch;

  if (cached && cached.expiresAtMs - now() > TOKEN_SKEW_MS) return cached.token;

  const { clientId, clientSecret } = loadSatelliteConfig();
  const res = await doFetch(CDSE.token, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    // Never include the response body: it can echo credentials back (rule §2.12).
    throw new SatelliteAuthError(`CDSE token request failed with HTTP ${res.status}`);
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new SatelliteAuthError("CDSE token response contained no access_token");

  const ttlS = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 600;
  cached = { token: body.access_token, expiresAtMs: now() + ttlS * 1000 };
  return cached.token;
}
