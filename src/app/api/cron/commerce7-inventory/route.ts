import { runCommerce7InventorySync } from "@/lib/commerce/inventory-sync";
import { runCommerce7DriftCheck } from "@/lib/commerce/inventory-drift";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Phase 16 Unit 6 — the outbound inventory cron. Pushes ERP finished-goods INCREASES to Commerce7
// (additive, watermark-idempotent), then runs the read-only drift check (writes a summary the dashboard
// surfaces; never corrects C7 inventory). Constant-time CRON_SECRET gate; enumerates internally.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const push = await runCommerce7InventorySync();
    const drift = await runCommerce7DriftCheck();
    return Response.json({ ok: true, push, drift });
  } catch (e) {
    return cronError(e, { route: "cron.commerce7-inventory" }, "Commerce7 inventory sync failed.");
  }
}

export const GET = handle;
export const POST = handle;
