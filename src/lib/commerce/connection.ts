import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { Commerce7Adapter, commerce7CallContext, loadCommerce7Config, fullWebhookUrl } from "@/lib/commerce/commerce7";
import type { CommerceAdapter } from "@/lib/commerce/adapter";

// Phase 16 Unit 3 — the Commerce7 connection lifecycle. Commerce7 has NO OAuth/tokens, so there is no
// token store here; the security anchor is a NONCE-BOUND install (reuses the OAuthState single-use-nonce
// pattern): an ERP admin clicks Connect → we mint a single-use nonce tied to them + this workspace →
// they authorize in Commerce7 → the callback (same authenticated browser) consumes the nonce, strict-
// validates the C7 tenant slug, and STAGES a PENDING_CONFIRM record. An explicit admin confirm flips it
// CONNECTED and registers the (HMAC-routed) webhook. The callback's `tenantId` (C7 slug) is NEVER
// trusted to pick OUR tenant — that comes from the verified session + the nonce. Node runtime (crypto).

export const INSTALL_TTL_MS = 15 * 60 * 1000; // an install round-trip is minutes; 15 is generous.

const b64url = (b: Buffer) => b.toString("base64url");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

// Commerce7 tenant slugs are lowercase alphanumerics + hyphens. Strict-validate before we ever store or
// send one in a `tenant:` header (defends the header + the display).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
export function assertValidSlug(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(s)) throw new Error("That doesn't look like a valid Commerce7 tenant.");
  return s;
}

export type BeginInstallResult = { setupUrl: string };

/** Mint a single-use install nonce bound to the initiating admin + workspace, and return the Commerce7
 *  app setup URL carrying it as `state`. Only the nonce hash is stored — the URL is not a stored secret. */
export async function beginInstall(input: { tenantId: string; userId: string; sessionId: string }): Promise<BeginInstallResult> {
  const setupBase = process.env.COMMERCE7_INSTALL_URL;
  if (!setupBase) throw new Error("COMMERCE7_INSTALL_URL is not set (the Commerce7 app install/setup URL).");

  const nonce = b64url(randomBytes(32));
  const nonceHash = sha256hex(nonce);
  await runInTenantTx(async (tx) => {
    await tx.commerce7InstallState.deleteMany({ where: { userId: input.userId } }); // housekeeping
    await tx.commerce7InstallState.create({
      data: { tenantId: input.tenantId, nonceHash, userId: input.userId, sessionId: input.sessionId, expiresAt: new Date(Date.now() + INSTALL_TTL_MS) },
    });
  });

  const u = new URL(setupBase);
  u.searchParams.set("state", nonce);
  return { setupUrl: u.toString() };
}

/** Consume the install nonce ATOMICALLY + single-use (delete-by-unique). Validates the same user +
 *  not-expired. Throws on replay/mismatch. Tenant comes from the verified session, NOT the callback. */
export async function consumeInstallNonce(input: { tenantId: string; rawState: string; userId: string }): Promise<void> {
  const nonceHash = sha256hex(input.rawState);
  const row = await runInTenantTx(async (tx) => {
    try {
      return await tx.commerce7InstallState.delete({ where: { tenantId_nonceHash: { tenantId: input.tenantId, nonceHash } } });
    } catch {
      return null; // a replay finds nothing (P2025)
    }
  });
  if (!row) throw new Error("This install link is invalid or has already been used.");
  if (row.userId !== input.userId) throw new Error("This install link belongs to a different user.");
  if (row.expiresAt.getTime() < Date.now()) throw new Error("This install link has expired — try connecting again.");
}

/** Stage a PENDING_CONFIRM connection for the (nonce-verified) install. Strict-validates the C7 slug. */
export async function stageInstall(input: { tenantId: string; externalTenantId: string; userId: string }): Promise<void> {
  const slug = assertValidSlug(input.externalTenantId);
  const cfg = loadCommerce7Config();
  const common = {
    status: "PENDING_CONFIRM" as const,
    environment: cfg.environment,
    externalTenantId: slug,
    installedByUserId: input.userId,
    companyName: slug,
  };
  await runInTenantTx((tx) =>
    tx.commerce7Connection.upsert({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: "COMMERCE7" } },
      create: { tenantId: input.tenantId, provider: "COMMERCE7", scopes: [], ...common },
      update: { ...common, webhookId: null, connectedAt: null },
    }),
  );
}

/** Admin confirm: flip PENDING_CONFIRM → CONNECTED and register the HMAC-routed webhook (best-effort;
 *  the reconciler recreates it if this fails). Guards the global one-install unique (P2002 → friendly). */
export async function confirmInstall(input: { tenantId: string; adapterFactory?: () => CommerceAdapter }): Promise<void> {
  const conn = await prisma.commerce7Connection.findFirst({
    where: { provider: "COMMERCE7" },
    select: { status: true, externalTenantId: true },
  });
  if (!conn || conn.status !== "PENDING_CONFIRM" || !conn.externalTenantId) {
    throw new Error("There's nothing to confirm — start the Commerce7 connection again.");
  }

  let webhookId: string | null = null;
  try {
    const adapter = input.adapterFactory ? input.adapterFactory() : new Commerce7Adapter();
    const ctx = commerce7CallContext(conn.externalTenantId);
    const r = await adapter.createWebhook(ctx, { deliveryUrl: fullWebhookUrl(input.tenantId), topics: ["Create", "Update", "Delete"] });
    webhookId = r.webhookId;
  } catch {
    // best-effort — the poll reconciler + webhook-health self-heal register it later (U8).
  }

  try {
    await runInTenantTx((tx) =>
      tx.commerce7Connection.update({
        where: { tenantId_provider: { tenantId: input.tenantId, provider: "COMMERCE7" } },
        data: { status: "CONNECTED", connectedAt: new Date(), webhookId, webhookConfiguredAt: webhookId ? new Date() : null },
      }),
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error("That Commerce7 tenant is already connected to another workspace.");
    throw e;
  }
}

/** Disconnect: set DISCONNECTED, best-effort delete the webhook, clear the poll cursor + display. */
export async function disconnect(input: { tenantId: string; adapterFactory?: () => CommerceAdapter }): Promise<void> {
  const conn = await runInTenantTx(async (tx) => {
    const existing = await tx.commerce7Connection.findUnique({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: "COMMERCE7" } },
      select: { status: true, externalTenantId: true, webhookId: true },
    });
    if (!existing || existing.status === "DISCONNECTED") return null;
    await tx.commerce7Connection.update({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: "COMMERCE7" } },
      data: { status: "DISCONNECTED", webhookId: null, webhookConfiguredAt: null, connectedAt: null, companyName: null, pollCursorUpdatedAt: null, pollCursorId: null },
    });
    return existing;
  });

  if (conn?.externalTenantId && conn.webhookId) {
    try {
      const adapter = input.adapterFactory ? input.adapterFactory() : new Commerce7Adapter();
      await adapter.deleteWebhook(commerce7CallContext(conn.externalTenantId), conn.webhookId);
    } catch {
      // best-effort — the local link is already gone.
    }
  }
}

export type Commerce7ConnectionSummary = {
  status: "CONNECTED" | "DISCONNECTED" | "NEEDS_REAUTH" | "PENDING_CONFIRM";
  companyName: string | null;
  externalTenantId: string | null;
  environment: string | null;
  connectedAt: string | null;
  webhookHealthy: boolean;
  lastWebhookAt: string | null;
};

const WEBHOOK_STALE_MS = 48 * 60 * 60 * 1000; // C7 auto-disables a webhook after 48h of failures.

/** Read-only status for the Settings card. Never returns any secret. */
export async function getConnectionSummary(): Promise<Commerce7ConnectionSummary | null> {
  const c = await prisma.commerce7Connection.findFirst({
    where: { provider: "COMMERCE7" },
    select: { status: true, companyName: true, externalTenantId: true, environment: true, connectedAt: true, webhookConfiguredAt: true, lastWebhookAt: true },
  });
  if (!c) return null;
  const connected = c.status === "CONNECTED";
  // Healthy = we have a webhook and either it's fresh, or it's newly configured with nothing yet.
  const lastActivity = c.lastWebhookAt ?? c.webhookConfiguredAt;
  const webhookHealthy = connected && !!c.webhookConfiguredAt && (!!lastActivity && Date.now() - lastActivity.getTime() < WEBHOOK_STALE_MS);
  return {
    status: c.status as Commerce7ConnectionSummary["status"],
    companyName: c.companyName,
    externalTenantId: c.externalTenantId,
    environment: c.environment,
    connectedAt: c.connectedAt ? c.connectedAt.toISOString() : null,
    webhookHealthy,
    lastWebhookAt: c.lastWebhookAt ? c.lastWebhookAt.toISOString() : null,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
