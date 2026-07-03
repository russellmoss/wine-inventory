# Phase 15 — Security Pass: per-tenant QBO token store + OAuth flow
**Date**: 2026-07-02
**Scope**: token storage + OAuth connect/callback/disconnect/refresh design (Units 1, 2, 4, 5, 8).
**Reviewer**: adversarial threat-model via council-mcp (Codex/gpt-5.4, app-security lens).
**Status**: findings folded into the plan's *Security Hardening (v2.1)* block + the affected units.
This is the second user-mandated review gate — heavier than a default plan, lighter than the
Phase-12 gate.

## Threat model (attacker goals)
- Steal a tenant's QBO refresh token for long-lived offline access to their books.
- Bind a victim tenant to the attacker's QBO company (or vice versa) via OAuth state/code/realm abuse.
- Abuse privileged background paths (`runAsSystem`/cron) to cross tenant isolation.
- Turn logs / Sentry / CI secrets / error handling into token-exfiltration channels.
- Force false NEEDS_REAUTH / disconnect to deny service or set up a relink attack.

## Findings (folded into the plan)

### CRITICAL
- **SEC-C1 — `state` must be server-stored + atomically single-use.** A signed blob alone is
  replayable: a live `state` lets an attacker complete `/callback` with their own QBO `code` and bind
  the victim tenant to the attacker's company. **Fix (folded):** `OAuthState` table (hashed nonce +
  tenantId/userId/sessionId/provider/redirectUri/PKCE/expiresAt), consumed with `DELETE … RETURNING`
  before code exchange; re-check the caller is still that tenant's admin at consume time.
- **SEC-C2 — Don't trust callback `realmId`.** A user with multiple QBO companies can tamper the
  callback `realmId` and mis-key the connection. **Fix:** derive the canonical company ID from a
  trusted Intuit endpoint after exchange; guard that one active `externalRealmId` can't attach to two
  tenants.
- **SEC-C3 — `runAsSystem` (BYPASSRLS owner) is not leak-proof for a secret table.** One future
  refactor/debug/forged-cron path under owner context = full cross-tenant token disclosure. **Fix:**
  a dedicated least-privilege *enumerator* role for cron with read on the org-ID source and **no
  grant on `AccountingConnection`/`OAuthState`/token tables**; owner role is migrations-only.
- **SEC-C4 — Single `APP_ENCRYPTION_KEY` = whole-corpus compromise.** A secrets-store/backup leak
  decrypts every tenant's tokens offline. **RESOLVED (provisional):** per-record DEK wrapped by an
  env KEK (`APP_ENCRYPTION_KEK`) — each token row has its own key; only the KEK is shared; upgradable
  to a cloud KMS later without re-encrypting rows (re-wrap DEKs). Env-split KEKs. Revisit before prod
  GA. (Decided by planner while operator away.)

### SHOULD FIX (folded)
- **SEC-S1** PKCE + exact redirect binding even for a confidential server client.
- **SEC-S2** `redirect_uri` from a hardcoded per-env allowlist; never `Host`/`X-Forwarded-Host`; no
  arbitrary post-auth redirects.
- **SEC-S3** Egress locked to exact Intuit HTTPS origins; disable HTTP redirect-following.
- **SEC-S4** Telemetry redaction: strip `code`/`access_token`/`refresh_token`/`Authorization` from
  logs; disable Prisma query-param logging on these paths; Sentry `beforeSend` drops OAuth payloads
  (Sentry is live in prod).
- **SEC-S5** Disconnect zeroizes ciphertext + bumps `tokenVersion` + sets DISCONNECTED in one txn,
  then best-effort revoke; DB CHECK non-CONNECTED rows hold no tokens.
- **SEC-S6** Re-check authz on every mutating route; derive tenant from session; address rows by
  `[tenantId, id]`, never a request-supplied `tenantId`/global `connectionId`.
- **SEC-S7** CRON routes: `POST`, `CRON_SECRET` via `timingSafeEqual`, ignore caller-supplied tenant,
  enumerate internally; rotate the secret.

### NITS (folded)
- **SEC-N1** AAD binds `table|provider|environment|tenantId|connectionId|fieldName|kid`.
- **SEC-N2** Persist only the refresh token; cache the access token in memory/short-lived (not a DB
  column) to shrink the DB-compromise blast radius.
- **SEC-N3** Request only the exact `com.intuit.quickbooks.accounting` scope; no OIDC scopes.
- **SEC-N4** Refresh path row-locked (advisory/`FOR UPDATE`) + CAS; mark NEEDS_REAUTH only after a
  locked re-read confirms no newer token was written.

## Operator decision — SEC-C4 (resolved provisionally)
Chosen: **per-record DEK wrapped by an env KEK** (middle ground). Rationale: much smaller blast
radius than a single shared key, no external-KMS dependency to wire now, and upgradable to a cloud
KMS later without re-encrypting rows. **Revisit before a real winery connects in production** — the
KEK is still env-resident, so a prod secrets leak still exposes the KEK; a KMS-held KEK closes that.
