import "server-only";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { AccountingProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { seal, open, type EnvelopeAad } from "@/lib/crypto/envelope";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import { assertAllowedRedirectUri, loadQboConfig } from "@/lib/accounting/qbo/config";
import type { OAuthTokens } from "@/lib/accounting/adapter";

// Phase 15 Unit 4 — the connection lifecycle: PKCE + single-use state (SEC-C1), encrypted token
// storage (Unit 1 envelope; ONLY the refresh token, never the access token — SEC-N2), canonical
// realmId derivation (SEC-C2), and a zeroize-then-revoke disconnect (SEC-S5). Every DB write is
// tenant-scoped through runInTenantTx (RLS) and addressed by (tenantId, provider) — never a
// client-supplied id. Node runtime (crypto + envelope).

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const STATE_TTL_MS = 10 * 60 * 1000; // an OAuth round-trip is seconds; 10 min is generous.

const b64url = (buf: Buffer) => buf.toString("base64url");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** The AAD that binds a refresh-token ciphertext to exactly this row/tenant/field/env (SEC-N1). */
function refreshTokenAad(tenantId: string, connectionId: string, environment: string): EnvelopeAad {
  return {
    table: "accounting_connection",
    provider: "QBO",
    environment,
    tenantId,
    connectionId,
    fieldName: "refreshToken",
  };
}

export type BeginConnectResult = { authorizeUrl: string };

/**
 * Begin a connect: mint a PKCE verifier + a single-use state nonce, persist them server-side
 * (OAuthState, tenant-scoped), and return the Intuit authorize URL. The raw nonce goes in the URL as
 * `state`; only its hash is stored, so the URL is not a stored secret. redirect_uri is taken from the
 * hardcoded allowlist (SEC-S1/S2), never a request header.
 */
export async function beginConnect(input: {
  tenantId: string;
  userId: string;
  sessionId: string;
}): Promise<BeginConnectResult> {
  const cfg = loadQboConfig();
  const redirectUri = assertAllowedRedirectUri(cfg.redirectUri);

  const nonce = b64url(randomBytes(32));
  const nonceHash = sha256hex(nonce);
  const codeVerifier = b64url(randomBytes(32)); // 43 chars, PKCE-valid
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());

  await runInTenantTx(async (tx) => {
    // Clear any stale states for this user+provider first (housekeeping; the nonce is unique anyway).
    await tx.oAuthState.deleteMany({ where: { userId: input.userId, provider: "QBO" } });
    await tx.oAuthState.create({
      data: {
        tenantId: input.tenantId,
        nonceHash,
        userId: input.userId,
        sessionId: input.sessionId,
        provider: "QBO",
        redirectUri,
        pkceVerifier: codeVerifier,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
  });

  const adapter = new QboAdapter({ config: cfg });
  const authorizeUrl = adapter.buildAuthorizeUrl({ scope: QBO_SCOPE, state: nonce, redirectUri, codeChallenge });
  return { authorizeUrl };
}

export type ConsumedState = { redirectUri: string; pkceVerifier: string };

/**
 * Consume a state nonce ATOMICALLY and single-use (SEC-C1): delete the row by (tenantId, nonceHash)
 * — a replay finds nothing and throws. Validates provider + that the SAME user who started the flow
 * is completing it, and that it hasn't expired. The caller re-checks admin separately (SEC-C1).
 */
export async function consumeState(input: {
  tenantId: string;
  rawState: string;
  userId: string;
}): Promise<ConsumedState> {
  const nonceHash = sha256hex(input.rawState);
  const row = await runInTenantTx(async (tx) => {
    try {
      // delete-by-unique is atomic single-use: a concurrent replay hits P2025 (row already gone).
      return await tx.oAuthState.delete({
        where: { tenantId_nonceHash: { tenantId: input.tenantId, nonceHash } },
      });
    } catch {
      return null;
    }
  });
  if (!row) throw new Error("This connection link is invalid or has already been used.");
  if (row.provider !== "QBO") throw new Error("State/provider mismatch.");
  if (row.userId !== input.userId) throw new Error("This connection link belongs to a different user.");
  if (row.expiresAt.getTime() < Date.now()) throw new Error("This connection link has expired — try connecting again.");
  return { redirectUri: row.redirectUri, pkceVerifier: row.pkceVerifier };
}

/**
 * Persist a freshly-obtained token set as a CONNECTED connection: encrypt the REFRESH token only
 * (access token stays in memory — SEC-N2), store the canonical realmId + company + home currency.
 * Upserts on (tenantId, provider) so reconnect re-links the same row (bumping tokenVersion). Throws a
 * friendly error if this QBO company is already connected to another workspace (SEC-C2 global guard).
 */
export async function storeConnection(input: {
  tenantId: string;
  environment: string;
  tokens: OAuthTokens;
  realmId: string;
  companyName: string;
  homeCurrency: string;
}): Promise<string> {
  const { tenantId, environment, tokens, realmId, companyName, homeCurrency } = input;
  const refreshTokenExpiresAt = tokens.refreshTokenExpiresInSec
    ? new Date(Date.now() + tokens.refreshTokenExpiresInSec * 1000)
    : null;

  try {
    return await runInTenantTx(async (tx) => {
      const existing = await tx.accountingConnection.findUnique({
        where: { tenantId_provider: { tenantId, provider: "QBO" } },
        select: { id: true },
      });
      const connectionId = existing?.id ?? randomUUID();
      const sealed = seal(tokens.refreshToken, refreshTokenAad(tenantId, connectionId, environment));

      const common = {
        status: "CONNECTED" as const,
        environment,
        externalRealmId: realmId,
        refreshTokenCt: sealed.ciphertext,
        dekWrapped: sealed.wrappedDek,
        refreshTokenExpiresAt,
        scope: tokens.scope ?? QBO_SCOPE,
        homeCurrency,
        companyName,
        connectedAt: new Date(),
      };
      await tx.accountingConnection.upsert({
        where: { tenantId_provider: { tenantId, provider: "QBO" } },
        create: { id: connectionId, tenantId, provider: "QBO", tokenVersion: 0, ...common },
        update: { ...common, tokenVersion: { increment: 1 } },
      });
      return connectionId;
    });
  } catch (e) {
    // The partial unique on (provider, externalRealmId) WHERE CONNECTED raises here.
    if (isUniqueViolation(e)) {
      throw new Error("That QuickBooks company is already connected to another workspace.");
    }
    throw e;
  }
}

/**
 * Disconnect (SEC-S5): in ONE tenant txn, zeroize the ciphertext + set DISCONNECTED + bump
 * tokenVersion; commit. THEN best-effort remote revoke (a revoke failure must never leave a stored
 * token — the DB is already clean). The DB CHECK guarantees a non-CONNECTED row holds no tokens.
 */
export async function disconnect(input: { tenantId: string; environment: string }): Promise<void> {
  const { tenantId } = input;
  const refreshToken = await runInTenantTx(async (tx) => {
    const existing = await tx.accountingConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: "QBO" } },
      select: { id: true, status: true, refreshTokenCt: true, dekWrapped: true, environment: true },
    });
    if (!existing || existing.status !== "CONNECTED") return null;

    let token: string | null = null;
    if (existing.refreshTokenCt && existing.dekWrapped) {
      try {
        token = open(
          { ciphertext: existing.refreshTokenCt, wrappedDek: existing.dekWrapped },
          refreshTokenAad(tenantId, existing.id, existing.environment),
        );
      } catch {
        token = null; // can't decrypt -> can't revoke, but STILL zeroize + disconnect below
      }
    }
    await tx.accountingConnection.update({
      where: { tenantId_provider: { tenantId, provider: "QBO" } },
      data: {
        status: "DISCONNECTED",
        refreshTokenCt: null,
        dekWrapped: null,
        refreshTokenExpiresAt: null,
        companyName: null,
        connectedAt: null,
        tokenVersion: { increment: 1 },
      },
    });
    return token;
  });

  if (refreshToken) {
    try {
      await new QboAdapter().revoke(refreshToken);
    } catch {
      // best-effort — the local secret is already gone.
    }
  }
}

export type ConnectionSummary = {
  status: "CONNECTED" | "DISCONNECTED" | "NEEDS_REAUTH";
  companyName: string | null;
  environment: string | null;
  homeCurrency: string | null;
  connectedAt: string | null;
};

/** Read-only status for the Settings card. Never returns any token material. */
export async function getConnectionSummary(): Promise<ConnectionSummary | null> {
  const c = await prisma.accountingConnection.findFirst({
    where: { provider: "QBO" },
    select: { status: true, companyName: true, environment: true, homeCurrency: true, connectedAt: true },
  });
  if (!c) return null;
  return {
    // Accounting connections never enter PENDING_CONFIRM (Phase-16 added that value to the shared enum
    // for commerce7 only); narrow it back to the accounting states.
    status: c.status as ConnectionSummary["status"],
    companyName: c.companyName,
    environment: c.environment,
    homeCurrency: c.homeCurrency,
    connectedAt: c.connectedAt ? c.connectedAt.toISOString() : null,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export type { AccountingProvider };
