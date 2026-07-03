import { timingSafeEqual } from "node:crypto";
import { loadWebhookSecret } from "@/lib/commerce/commerce7";

// Phase 16 Unit 3 — the Commerce7 app-uninstall callback. Commerce7 posts to ONE app-global URL with the
// C7 tenant slug and no session, so this handler cannot cross-tenant-resolve which of our tenants to
// disconnect (the commerce tables are RLS-forced and the web app is a NOBYPASSRLS role — we deliberately
// never reach for the BYPASSRLS owner from an HTTP path). It authenticates via the inbound webhook secret
// and acknowledges; the ACTUAL disconnection is picked up by the per-tenant poll/reconcile, which runs
// under app_rls and marks the connection when Commerce7 rejects the app credentials. In-app Disconnect
// (Settings) is the primary, immediate control. Node runtime (constant-time compare).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  let secret: string;
  try {
    secret = loadWebhookSecret();
  } catch {
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(`Basic ${Buffer.from(`commerce7:${secret}`).toString("base64")}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  // Acknowledge; the reconciler self-heals connection state per tenant (see file header).
  return Response.json({ ok: true, note: "acknowledged; disconnection is reconciled per-tenant" });
}

export const POST = handle;
export const GET = handle;
