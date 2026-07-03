import "server-only";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { seal, open, type EnvelopeAad } from "@/lib/crypto/envelope";
import { QboAdapter, type ClientDeps } from "@/lib/accounting/qbo/client";
import { ProviderFault, type OAuthTokens } from "@/lib/accounting/adapter";

// Phase 15 Unit 5 — the ONLY way to get a usable access token, and the ONLY place a refresh happens.
// The QBO refresh token ROTATES on every refresh, so a lost/duplicated refresh bricks the connection.
// We serialize refresh PER CONNECTION with a row lock (SELECT … FOR UPDATE) + a tokenVersion CAS, all
// inside runInTenantTx (RLS + SET LOCAL, pooling-safe). The access token is cached IN MEMORY only,
// never persisted (SEC-N2). Because we hold the row lock across read→refresh→write, our read is
// authoritative: a refresh failure means NEEDS_REAUTH with no lost-race false positive (SEC-N4).
// Must be called inside a tenant context (runAsTenant); RLS scopes the row to the caller's tenant.

const ACCESS_SKEW_MS = 120_000; // refresh when < 2 min of access-token life remains
const REFRESH_TX_TIMEOUT_MS = 20_000; // a token refresh holds the row lock across one HTTP round-trip

type Cached = { token: string; expiresAtMs: number; tokenVersion: number };
const accessCache = new Map<string, Cached>();

/** Thrown when the connection can no longer be refreshed — the operator must reconnect. */
export class NeedsReauthError extends Error {
  constructor(message = "QuickBooks needs to be reconnected.") {
    super(message);
    this.name = "NeedsReauthError";
  }
}

function refreshAad(tenantId: string, connectionId: string, environment: string): EnvelopeAad {
  return { table: "accounting_connection", provider: "QBO", environment, tenantId, connectionId, fieldName: "refreshToken" };
}

/** Test seam: clear the in-memory access-token cache. */
export function _clearAccessCache(): void {
  accessCache.clear();
}

/** Test seam (Unit 13): pre-seed a valid access token so getValidAccessToken skips the live refresh. */
export function _seedAccessCache(connectionId: string, token: string, tokenVersion = 0, ttlMs = 3_600_000): void {
  accessCache.set(connectionId, { token, expiresAtMs: Date.now() + ttlMs, tokenVersion });
}

/**
 * Return a valid access token for the connection, refreshing (and rotating the refresh token) if the
 * cached one is missing/near-expiry. `force` skips the cache and always rotates — used by the sweep to
 * keep an idle connection's 100-day refresh token alive.
 */
export async function getValidAccessToken(
  connectionId: string,
  opts: { force?: boolean; deps?: ClientDeps } = {},
): Promise<string> {
  if (!opts.force) {
    const cached = accessCache.get(connectionId);
    if (cached && cached.expiresAtMs - Date.now() > ACCESS_SKEW_MS) return cached.token;
  }
  return refreshLocked(connectionId, opts);
}

type LockRow = {
  id: string;
  status: string;
  refreshTokenCt: string | null;
  dekWrapped: string | null;
  tokenVersion: number;
  environment: string;
};

async function refreshLocked(connectionId: string, opts: { force?: boolean; deps?: ClientDeps }): Promise<string> {
  const tenantId = requireTenantId();

  const result = await runInTenantTx(
    async (tx): Promise<{ kind: "ok"; token: string } | { kind: "needs_reauth" }> => {
      // Lock the row for the whole read→refresh→write so concurrent refreshers serialize (only one
      // CAS wins; the loser reads the freshly-rotated token, never overwriting it with a stale one).
      const rows = await tx.$queryRaw<LockRow[]>`
        SELECT "id", "status", "refreshTokenCt", "dekWrapped", "tokenVersion", "environment"
        FROM "accounting_connection" WHERE "id" = ${connectionId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new Error("No such QuickBooks connection for this tenant.");
      if (row.status !== "CONNECTED") return { kind: "needs_reauth" };

      // Under the lock, honor a token another caller just refreshed (avoids a redundant rotation).
      if (!opts.force) {
        const c = accessCache.get(connectionId);
        if (c && c.tokenVersion === row.tokenVersion && c.expiresAtMs - Date.now() > ACCESS_SKEW_MS) {
          return { kind: "ok", token: c.token };
        }
      }
      if (!row.refreshTokenCt || !row.dekWrapped) return { kind: "needs_reauth" };

      const refreshToken = open(
        { ciphertext: row.refreshTokenCt, wrappedDek: row.dekWrapped },
        refreshAad(tenantId, connectionId, row.environment),
      );

      let tokens: OAuthTokens;
      try {
        tokens = await new QboAdapter({ deps: opts.deps }).refresh(refreshToken);
      } catch (e) {
        // We hold the lock, so this read is authoritative (SEC-N4). A dead refresh token / auth
        // failure => NEEDS_REAUTH; commit that status (return, don't throw, so it persists).
        const isAuth = e instanceof ProviderFault ? e.kind === "auth" : /invalid_grant|token/i.test(String((e as Error)?.message));
        if (isAuth) {
          await tx.accountingConnection.update({ where: { id: connectionId }, data: { status: "NEEDS_REAUTH" } });
          return { kind: "needs_reauth" };
        }
        throw e; // transient/unknown — let the caller retry later (status stays CONNECTED)
      }

      const sealed = seal(tokens.refreshToken, refreshAad(tenantId, connectionId, row.environment));
      const newVersion = row.tokenVersion + 1;
      await tx.accountingConnection.update({
        where: { id: connectionId },
        data: {
          refreshTokenCt: sealed.ciphertext,
          dekWrapped: sealed.wrappedDek,
          tokenVersion: newVersion,
          ...(tokens.refreshTokenExpiresInSec
            ? { refreshTokenExpiresAt: new Date(Date.now() + tokens.refreshTokenExpiresInSec * 1000) }
            : {}),
        },
      });
      accessCache.set(connectionId, {
        token: tokens.accessToken,
        expiresAtMs: Date.now() + tokens.expiresInSec * 1000,
        tokenVersion: newVersion,
      });
      return { kind: "ok", token: tokens.accessToken };
    },
    { timeout: REFRESH_TX_TIMEOUT_MS },
  );

  if (result.kind === "needs_reauth") throw new NeedsReauthError();
  return result.token;
}
