// Phase 15 Unit 3 — QBO OAuth2 token dance (authorize URL + code exchange + refresh + revoke).
// SEC-S3: talks ONLY to the hardcoded Intuit origins and disables redirect-following. SEC-S4: never
// logs a code/token/Authorization header. The refresh-token ROTATES on every refresh (research), so
// the caller must persist the newest one (Unit 5 does this under a per-connection lock).

import { INTUIT, type QboAppConfig } from "@/lib/accounting/qbo/config";
import type { OAuthTokens } from "@/lib/accounting/adapter";

/** Injectable for tests (mock fetch; no network). */
export type OAuthDeps = { fetchImpl?: typeof fetch };
const getFetch = (d?: OAuthDeps): typeof fetch => d?.fetchImpl ?? fetch;

function basicAuth(cfg: QboAppConfig): string {
  return "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

/** PURE: the Intuit authorize URL with PKCE (S256). `state` is the server-stored single-use nonce. */
export function buildAuthorizeUrl(
  cfg: QboAppConfig,
  input: { scope: string; state: string; redirectUri: string; codeChallenge: string },
): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: input.scope,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${INTUIT.authorize}?${q.toString()}`;
}

type RawTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function parseTokens(raw: RawTokenResponse, realmIdHint?: string): OAuthTokens {
  if (!raw.access_token || !raw.refresh_token) {
    // Do NOT include the raw body — it may carry secrets. Surface the error code only.
    throw new Error(`Token endpoint returned no tokens${raw.error ? ` (${raw.error})` : ""}.`);
  }
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresInSec: raw.expires_in ?? 3600,
    refreshTokenExpiresInSec: raw.x_refresh_token_expires_in,
    scope: raw.scope,
    realmIdHint,
  };
}

async function tokenRequest(cfg: QboAppConfig, body: URLSearchParams, deps?: OAuthDeps): Promise<RawTokenResponse> {
  const res = await getFetch(deps)(INTUIT.token, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    redirect: "error", // SEC-S3: never follow a redirect off the token endpoint
  });
  const json = (await res.json().catch(() => ({}))) as RawTokenResponse;
  if (!res.ok) {
    // invalid_grant here means the refresh token is dead -> NEEDS_REAUTH (surfaced by Unit 5).
    throw new Error(`Token request failed (${res.status}${json.error ? `, ${json.error}` : ""}).`);
  }
  return json;
}

export async function exchangeCode(
  cfg: QboAppConfig,
  input: { code: string; redirectUri: string; codeVerifier: string; realmIdHint?: string },
  deps?: OAuthDeps,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });
  return parseTokens(await tokenRequest(cfg, body, deps), input.realmIdHint);
}

export async function refresh(cfg: QboAppConfig, refreshToken: string, deps?: OAuthDeps): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  return parseTokens(await tokenRequest(cfg, body, deps));
}

export async function revoke(cfg: QboAppConfig, token: string, deps?: OAuthDeps): Promise<void> {
  // Best-effort: revocation failure must not block a disconnect (the DB is already zeroized — SEC-S5).
  await getFetch(deps)(INTUIT.revoke, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token }),
    redirect: "error",
  });
}
