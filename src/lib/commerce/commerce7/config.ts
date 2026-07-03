// Phase 16 Unit 2 — Commerce7 app config + locked egress. SEC: the Commerce7 API origin is a HARDCODED
// HTTPS constant (never derived from a request header), and every fetch disables redirect-following. The
// app credentials (App ID + Secret Key) + the SEPARATE inbound webhook Basic Auth secret are env-only
// (never a DB column, never logged). The Secret Key is a single app-global high-value credential
// (SEC-C4 posture: env now, KMS-backed access before GA).
//
// AUTH: Commerce7 is NOT OAuth2 — App ID + App Secret Key over HTTP Basic Auth + a `tenant:` header
// naming the winery. No per-tenant tokens, no rotation. (developer.commerce7.com/docs/create-an-app)

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CommerceEnvironment } from "@/lib/commerce/adapter";

/** The ONE Commerce7 REST origin these modules ever talk to (locked egress). REST only, no GraphQL. */
export const COMMERCE7_API_BASE = "https://api.commerce7.com/v1" as const;

export type Commerce7AppConfig = {
  appId: string;
  secretKey: string;
  environment: CommerceEnvironment;
};

/** Read the Commerce7 app credentials from env. Throws (fail-closed) if unset — a missing secret must
 *  never silently degrade to an unauthenticated call. Never logs the values. */
export function loadCommerce7Config(): Commerce7AppConfig {
  const appId = process.env.COMMERCE7_APP_ID;
  const secretKey = process.env.COMMERCE7_SECRET_KEY;
  const environment = (process.env.COMMERCE7_ENVIRONMENT || "sandbox") as CommerceEnvironment;
  if (!appId || !secretKey) throw new Error("COMMERCE7_APP_ID / COMMERCE7_SECRET_KEY are not set.");
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error(`COMMERCE7_ENVIRONMENT must be 'sandbox' or 'production' (got '${environment}').`);
  }
  return { appId, secretKey, environment };
}

/** The SEPARATE inbound webhook Basic Auth secret (NOT the app Secret Key — a shared secret widens
 *  blast radius). Unset → webhook auth fails closed. Never logged. */
export function loadWebhookSecret(): string {
  const s = process.env.COMMERCE7_WEBHOOK_SECRET;
  if (!s) throw new Error("COMMERCE7_WEBHOOK_SECRET is not set (the inbound webhook Basic Auth secret).");
  return s;
}

/** The public app base URL (no trailing slash) the Commerce7 webhook posts to. */
export function webhookBaseUrl(): string {
  const base = process.env.COMMERCE7_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  if (!base) throw new Error("COMMERCE7_WEBHOOK_BASE_URL (or NEXT_PUBLIC_APP_URL) is not set.");
  return base.replace(/\/$/, "");
}

// The webhook delivery URL embeds OUR tenant id + an HMAC of it (keyed on the inbound webhook secret).
// This routes a session-less C7 POST to the right tenant WITHOUT a cross-tenant DB read (the commerce
// tables are RLS-forced and the app is a NOBYPASSRLS role), and the HMAC makes the URL unguessable +
// authentic (no HMAC on C7 payloads, so we self-sign the path). Constant-time verified on receipt.

/** Deterministic HMAC of our tenant id, keyed on the inbound webhook secret (hex). */
export function webhookPathSig(tenantId: string): string {
  return createHmac("sha256", loadWebhookSecret()).update(tenantId).digest("hex");
}

/** Constant-time verify a (tenantId, sig) webhook path segment. */
export function verifyWebhookPath(tenantId: string, sig: string): boolean {
  const expected = webhookPathSig(tenantId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The full per-tenant webhook delivery URL registered with Commerce7. */
export function fullWebhookUrl(tenantId: string): string {
  return `${webhookBaseUrl()}/api/commerce7/webhook/${encodeURIComponent(tenantId)}/${webhookPathSig(tenantId)}`;
}
